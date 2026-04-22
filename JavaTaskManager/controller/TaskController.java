package controller;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import model.Task;
import model.TaskHistory;
import service.TaskManager;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TaskController {
	private static final Pattern EMAIL_REGEX = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
	private static final Pattern SPECIAL_CHAR_REGEX = Pattern.compile("[^A-Za-z0-9]");
	private static final long LOGIN_CODE_TTL_MS = 10 * 60 * 1000;
	private static final int LOGIN_CODE_MAX_ATTEMPTS = 5;
	private static final SecureRandom RANDOM = new SecureRandom();

	private static class PendingLogin {
		private final int userId;
		private final String username;
		private final String role;
		private final String avatarUrl;
		private final String email;
		private final String codeHash;
		private final long expiresAtMs;
		private int attempts;

		private PendingLogin(int userId, String username, String role, String avatarUrl, String email, String codeHash, long expiresAtMs) {
			this.userId = userId;
			this.username = username;
			this.role = role;
			this.avatarUrl = avatarUrl;
			this.email = email;
			this.codeHash = codeHash;
			this.expiresAtMs = expiresAtMs;
			this.attempts = 0;
		}
	}

	private static class Session {
		private final int userId;
		private final String username;
		private final String role;

		private Session(int userId, String username, String role) {
			this.userId = userId;
			this.username = username;
			this.role = role;
		}
	}

	private final HttpServer server;
	private final TaskManager taskManager;
	private final Map<String, Session> sessions;
	private final Map<String, PendingLogin> pendingLogins;
	private final HttpClient httpClient;

	public TaskController(int port) throws IOException {
		this.taskManager = new TaskManager();
		this.sessions = new ConcurrentHashMap<>();
		this.pendingLogins = new ConcurrentHashMap<>();
		this.httpClient = HttpClient.newHttpClient();
		this.server = HttpServer.create(new InetSocketAddress(port), 0);
		this.server.createContext("/api/auth/login", new LoginHandler());
		this.server.createContext("/api/auth/verify", new VerifyLoginHandler());
		this.server.createContext("/api/auth/register", new RegisterHandler());
		this.server.createContext("/api/users/me/avatar", new AvatarHandler());
		this.server.createContext("/api/tasks", new TaskHandler());
		this.server.setExecutor(null);
	}

	public void start() {
		server.start();
		System.out.println("API MVC active sur http://localhost:8080/api/tasks");
	}

	private class TaskHandler implements HttpHandler {
		@Override
		public void handle(HttpExchange exchange) throws IOException {
			addCorsHeaders(exchange);

			String method = exchange.getRequestMethod();
			String path = exchange.getRequestURI().getPath();
			Session session = getSession(exchange);
			if ("OPTIONS".equalsIgnoreCase(method)) {
				exchange.sendResponseHeaders(204, -1);
				exchange.close();
				return;
			}

			if (session == null) {
				writeJson(exchange, 401, "{\"error\":\"Unauthorized\"}");
				return;
			}

			try {
				if ("GET".equalsIgnoreCase(method) && "/api/tasks".equals(path)) {
					List<Task> tasks = taskManager.getAllTasks(session.userId);
					writeJson(exchange, 200, tasksToJson(tasks));
					return;
				}

				if ("GET".equalsIgnoreCase(method) && path.matches("^/api/tasks/\\d+/history$")) {
					int id = extractId(path, "/history");
					List<TaskHistory> history = taskManager.getTaskHistory(id, session.userId);
					writeJson(exchange, 200, historyToJson(history));
					return;
				}

				if ("POST".equalsIgnoreCase(method) && "/api/tasks".equals(path)) {
					Task task = parseTask(exchange);
					int id = taskManager.createTask(task, session.userId);
					if (id <= 0) {
						writeJson(exchange, 500, "{\"error\":\"Creation failed\"}");
						return;
					}
					writeJson(exchange, 201, "{\"id\":" + id + "}");
					return;
				}

				if ("PATCH".equalsIgnoreCase(method) && path.matches("^/api/tasks/\\d+/complete$")) {
					int id = extractId(path, "/complete");
					boolean updated = taskManager.completeTask(id, session.userId);
					if (!updated) {
						writeJson(exchange, 404, "{\"error\":\"Task not found\"}");
						return;
					}
					writeJson(exchange, 200, "{\"updated\":true}");
					return;
				}

				if ("PUT".equalsIgnoreCase(method) && path.matches("^/api/tasks/\\d+$")) {
					int id = extractId(path, "");
					Task task = parseTask(exchange);
					task.setId(id);
					boolean updated = taskManager.updateTask(task, session.userId);
					if (!updated) {
						writeJson(exchange, 404, "{\"error\":\"Task not found\"}");
						return;
					}
					writeJson(exchange, 200, "{\"updated\":true}");
					return;
				}

				if ("DELETE".equalsIgnoreCase(method) && path.matches("^/api/tasks/\\d+$")) {
					int id = extractId(path, "");
					boolean deleted = taskManager.deleteTask(id, session.userId);
					if (!deleted) {
						writeJson(exchange, 404, "{\"error\":\"Task not found\"}");
						return;
					}
					writeJson(exchange, 200, "{\"deleted\":true}");
					return;
				}

				writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
			} catch (SQLException e) {
				writeJson(exchange, 500, "{\"error\":\"Database error\"}");
			} catch (IllegalArgumentException e) {
				writeJson(exchange, 400, "{\"error\":\"Invalid payload\"}");
			}
		}
	}

	private class LoginHandler implements HttpHandler {
		@Override
		public void handle(HttpExchange exchange) throws IOException {
			addCorsHeaders(exchange);
			if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
				exchange.sendResponseHeaders(204, -1);
				exchange.close();
				return;
			}

			if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
				writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
				return;
			}

			try {
				String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				String username = extractString(body, "username");
				String password = extractString(body, "password");

				if (username == null || username.isBlank() || password == null || password.isBlank()) {
					writeJson(exchange, 400, "{\"error\":\"Missing credentials\"}");
					return;
				}

				cleanupExpiredPendingLogins();
				String identifier = username.trim();
				TaskManager.AuthUser user = taskManager.login(identifier, password);
				if (user == null) {
					writeJson(exchange, 401, "{\"error\":\"Invalid credentials\"}");
					return;
				}

				if (!isValidEmail(identifier) && !"ADMIN".equalsIgnoreCase(user.getRole())) {
					writeJson(exchange, 400, "{\"error\":\"Email obligatoire pour les comptes non-admin\"}");
					return;
				}

				String userEmail = user.getUsername();
				if (!isValidEmail(userEmail)) {
					String token = UUID.randomUUID().toString();
					sessions.put(token, new Session(user.getId(), user.getUsername(), user.getRole()));
					writeJson(exchange, 200,
							"{\"token\":\"" + escapeJson(token) + "\",\"username\":\"" + escapeJson(user.getUsername()) + "\",\"role\":\"" + escapeJson(user.getRole()) + "\",\"avatarUrl\":" + toJsonNullableString(user.getAvatarUrl()) + "}");
					return;
				}

				String code = generateLoginCode();
				String challengeToken = UUID.randomUUID().toString();
				PendingLogin pendingLogin = new PendingLogin(
						user.getId(),
						user.getUsername(),
						user.getRole(),
						user.getAvatarUrl(),
						userEmail,
						hashValue(code),
						System.currentTimeMillis() + LOGIN_CODE_TTL_MS
				);
				pendingLogins.put(challengeToken, pendingLogin);

				boolean mailSent = sendLoginCodeEmail(userEmail, code);
				if (!mailSent) {
					pendingLogins.remove(challengeToken);
					writeJson(exchange, 500, "{\"error\":\"Impossible d'envoyer le code de connexion\"}");
					return;
				}

				writeJson(exchange, 202,
						"{\"requires2fa\":true,\"challengeToken\":\"" + escapeJson(challengeToken) + "\",\"maskedEmail\":\"" + escapeJson(maskEmail(userEmail)) + "\"}");
				return;
			} catch (SQLException e) {
				writeJson(exchange, 500, "{\"error\":\"Database error\"}");
			}
		}
	}

	private class VerifyLoginHandler implements HttpHandler {
		@Override
		public void handle(HttpExchange exchange) throws IOException {
			addCorsHeaders(exchange);
			if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
				exchange.sendResponseHeaders(204, -1);
				exchange.close();
				return;
			}

			if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
				writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
				return;
			}

			String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
			String challengeToken = extractString(body, "challengeToken");
			String code = extractString(body, "code");

			if (challengeToken == null || challengeToken.isBlank() || code == null || code.isBlank()) {
				writeJson(exchange, 400, "{\"error\":\"challengeToken et code requis\"}");
				return;
			}

			cleanupExpiredPendingLogins();
			PendingLogin pendingLogin = pendingLogins.get(challengeToken);
			if (pendingLogin == null) {
				writeJson(exchange, 401, "{\"error\":\"Code invalide ou expire\"}");
				return;
			}

			if (System.currentTimeMillis() > pendingLogin.expiresAtMs) {
				pendingLogins.remove(challengeToken);
				writeJson(exchange, 401, "{\"error\":\"Code expire\"}");
				return;
			}

			if (pendingLogin.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
				pendingLogins.remove(challengeToken);
				writeJson(exchange, 429, "{\"error\":\"Trop de tentatives\"}");
				return;
			}

			String providedHash = hashValue(code.trim());
			if (!providedHash.equals(pendingLogin.codeHash)) {
				pendingLogin.attempts++;
				if (pendingLogin.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
					pendingLogins.remove(challengeToken);
				}
				writeJson(exchange, 401, "{\"error\":\"Code invalide\"}");
				return;
			}

			pendingLogins.remove(challengeToken);
			String token = UUID.randomUUID().toString();
			sessions.put(token, new Session(pendingLogin.userId, pendingLogin.username, pendingLogin.role));
			writeJson(exchange, 200,
					"{\"token\":\"" + escapeJson(token) + "\",\"username\":\"" + escapeJson(pendingLogin.username) + "\",\"role\":\"" + escapeJson(pendingLogin.role) + "\",\"avatarUrl\":" + toJsonNullableString(pendingLogin.avatarUrl) + "}");
		}
	}

	private class RegisterHandler implements HttpHandler {
		@Override
		public void handle(HttpExchange exchange) throws IOException {
			addCorsHeaders(exchange);
			if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
				exchange.sendResponseHeaders(204, -1);
				exchange.close();
				return;
			}

			if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
				writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
				return;
			}

			try {
				String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				String username = extractString(body, "username");
				String password = extractString(body, "password");

				if (username == null || username.isBlank() || password == null || password.isBlank()) {
					writeJson(exchange, 400, "{\"error\":\"Missing credentials\"}");
					return;
				}

				String email = username.trim();
				if (!isValidEmail(email)) {
					writeJson(exchange, 400, "{\"error\":\"Adresse e-mail invalide\"}");
					return;
				}

				if (!isStrongPassword(password)) {
					writeJson(exchange, 400, "{\"error\":\"Mot de passe trop faible: minimum 12 caracteres et un caractere special\"}");
					return;
				}

				TaskManager.AuthUser user = taskManager.register(email, password);
				if (user == null) {
					writeJson(exchange, 409, "{\"error\":\"Email already exists\"}");
					return;
				}

				String token = UUID.randomUUID().toString();
				sessions.put(token, new Session(user.getId(), user.getUsername(), user.getRole()));
				writeJson(exchange, 201,
						"{\"token\":\"" + escapeJson(token) + "\",\"username\":\"" + escapeJson(user.getUsername()) + "\",\"role\":\"" + escapeJson(user.getRole()) + "\",\"avatarUrl\":" + toJsonNullableString(user.getAvatarUrl()) + "}");
			} catch (SQLException e) {
				writeJson(exchange, 500, "{\"error\":\"Database error\"}");
			}
		}
	}

	private class AvatarHandler implements HttpHandler {
		@Override
		public void handle(HttpExchange exchange) throws IOException {
			addCorsHeaders(exchange);
			if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
				exchange.sendResponseHeaders(204, -1);
				exchange.close();
				return;
			}

			if (!"PATCH".equalsIgnoreCase(exchange.getRequestMethod())) {
				writeJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
				return;
			}

			Session session = getSession(exchange);
			if (session == null) {
				writeJson(exchange, 401, "{\"error\":\"Unauthorized\"}");
				return;
			}

			try {
				String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				String avatarUrl = extractNullableString(body, "avatarUrl");
				if (avatarUrl != null && avatarUrl.isBlank()) {
					avatarUrl = null;
				}
				if (avatarUrl != null && avatarUrl.length() > 1000) {
					writeJson(exchange, 400, "{\"error\":\"Avatar URL too long\"}");
					return;
				}

				boolean updated = taskManager.updateAvatarUrl(session.userId, avatarUrl);
				if (!updated) {
					writeJson(exchange, 404, "{\"error\":\"User not found\"}");
					return;
				}

				TaskManager.AuthUser refreshedUser = taskManager.getAuthUserById(session.userId);
				writeJson(exchange, 200,
						"{\"updated\":true,\"avatarUrl\":" + toJsonNullableString(refreshedUser == null ? null : refreshedUser.getAvatarUrl()) + "}");
			} catch (SQLException e) {
				writeJson(exchange, 500, "{\"error\":\"Database error\"}");
			}
		}
	}

	private int extractId(String path, String suffix) {
		String raw = path.replace("/api/tasks/", "");
		if (!suffix.isEmpty()) {
			raw = raw.replace(suffix, "");
		}
		return Integer.parseInt(raw);
	}

	private Task parseTask(HttpExchange exchange) throws IOException {
		String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);

		String title = extractString(body, "title");
		String description = extractString(body, "description");
		String priority = extractString(body, "priority");
		String subjectName = extractNullableString(body, "subjectName");
		String category = extractString(body, "category");
		if (category == null || category.isBlank()) {
			category = extractString(body, "type");
		}
		String deadlineRaw = extractNullableString(body, "deadline");
		Boolean completed = extractBoolean(body, "completed");

		if (title == null || title.isBlank() || description == null || description.isBlank()) {
			throw new IllegalArgumentException("Missing required fields");
		}

		String normalizedCategory = normalizeCategory(category, deadlineRaw);
		Task task = new Task(0, title, description, completed != null && completed);
		task.setPriority(priority == null || priority.isBlank() ? "MEDIUM" : priority);
		task.setSubjectName(subjectName);
		task.setCategory(normalizedCategory);

		if ("WITH_DEADLINE".equals(normalizedCategory) && (deadlineRaw == null || deadlineRaw.isBlank())) {
			throw new IllegalArgumentException("Deadline is required for WITH_DEADLINE tasks");
		}

		if ("WITHOUT_DEADLINE".equals(normalizedCategory)) {
			task.setDeadline(null);
			return task;
		}

		if (deadlineRaw != null && !deadlineRaw.isBlank()) {
			task.setDeadline(LocalDate.parse(deadlineRaw));
		}

		return task;
	}

	private String extractString(String body, String key) {
		Pattern pattern = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*\\\"(.*?)\\\"");
		Matcher matcher = pattern.matcher(body);
		if (!matcher.find()) {
			return null;
		}
		return matcher.group(1)
				.replace("\\\\\"", "\"")
				.replace("\\\\n", "\n")
				.replace("\\\\r", "\r")
				.replace("\\\\\\\\", "\\");
	}

	private String extractNullableString(String body, String key) {
		Pattern nullPattern = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*null");
		if (nullPattern.matcher(body).find()) {
			return null;
		}
		return extractString(body, key);
	}

	private Boolean extractBoolean(String body, String key) {
		Pattern pattern = Pattern.compile("\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*(true|false)", Pattern.CASE_INSENSITIVE);
		Matcher matcher = pattern.matcher(body);
		if (!matcher.find()) {
			return null;
		}
		return Boolean.parseBoolean(matcher.group(1));
	}

	private void addCorsHeaders(HttpExchange exchange) {
		exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "http://localhost:5173");
		exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
		exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type, Authorization");
	}

	private void writeJson(HttpExchange exchange, int statusCode, String json) throws IOException {
		byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
		exchange.sendResponseHeaders(statusCode, bytes.length);
		try (OutputStream outputStream = exchange.getResponseBody()) {
			outputStream.write(bytes);
		}
	}

	private String tasksToJson(List<Task> tasks) {
		StringBuilder builder = new StringBuilder("[");
		for (int i = 0; i < tasks.size(); i++) {
			Task task = tasks.get(i);
			builder.append("{")
					.append("\"id\":").append(task.getId()).append(",")
					.append("\"category\":\"").append(escapeJson(task.getCategory())).append("\",")
					.append("\"type\":\"").append(escapeJson(task.getCategory())).append("\",")
					.append("\"title\":\"").append(escapeJson(task.getTitle())).append("\",")
					.append("\"description\":\"").append(escapeJson(task.getDescription())).append("\",")
					.append("\"priority\":\"").append(escapeJson(task.getPriority())).append("\",")
					.append("\"completed\":").append(task.isCompleted()).append(",")
					.append("\"subjectName\":").append(task.getSubjectName() == null ? "null" : "\"" + escapeJson(task.getSubjectName()) + "\"").append(",")
					.append("\"deadline\":").append(task.getDeadline() == null ? "null" : "\"" + task.getDeadline() + "\"")
					.append("}");

			if (i < tasks.size() - 1) {
				builder.append(",");
			}
		}
		builder.append("]");
		return builder.toString();
	}

	private String historyToJson(List<TaskHistory> history) {
		StringBuilder builder = new StringBuilder("[");
		for (int i = 0; i < history.size(); i++) {
			TaskHistory entry = history.get(i);
			builder.append("{")
					.append("\"id\":").append(entry.getId()).append(",")
					.append("\"taskId\":").append(entry.getTaskId()).append(",")
					.append("\"action\":\"").append(escapeJson(entry.getAction())).append("\",")
					.append("\"changedAt\":").append(entry.getChangedAt() == null ? "null" : "\"" + entry.getChangedAt() + "\"").append(",")
					.append("\"title\":\"").append(escapeJson(entry.getTitle())).append("\",")
					.append("\"description\":\"").append(escapeJson(entry.getDescription())).append("\",")
					.append("\"priority\":\"").append(escapeJson(entry.getPriority())).append("\",")
					.append("\"completed\":").append(entry.isCompleted()).append(",")
					.append("\"category\":").append(entry.getCategory() == null ? "null" : "\"" + escapeJson(entry.getCategory()) + "\"").append(",")
					.append("\"subjectName\":").append(entry.getSubjectName() == null ? "null" : "\"" + escapeJson(entry.getSubjectName()) + "\"").append(",")
					.append("\"deadline\":").append(entry.getDeadline() == null ? "null" : "\"" + entry.getDeadline() + "\"")
					.append("}");

			if (i < history.size() - 1) {
				builder.append(",");
			}
		}
		builder.append("]");
		return builder.toString();
	}

	private String escapeJson(String value) {
		if (value == null) {
			return "";
		}
		return value
				.replace("\\", "\\\\")
				.replace("\"", "\\\"")
				.replace("\n", "\\n")
				.replace("\r", "\\r");
	}

	private String toJsonNullableString(String value) {
		if (value == null) {
			return "null";
		}
		return "\"" + escapeJson(value) + "\"";
	}

	private Session getSession(HttpExchange exchange) {
		List<String> header = exchange.getRequestHeaders().get("Authorization");
		if (header == null || header.isEmpty()) {
			return null;
		}

		String value = header.get(0);
		if (value == null || !value.startsWith("Bearer ")) {
			return null;
		}

		String token = value.substring("Bearer ".length()).trim();
		if (token.isEmpty()) {
			return null;
		}

		return sessions.get(token);
	}

	private String normalizeCategory(String rawCategory, String deadlineRaw) {
		if (rawCategory == null || rawCategory.isBlank()) {
			return (deadlineRaw == null || deadlineRaw.isBlank()) ? "WITHOUT_DEADLINE" : "WITH_DEADLINE";
		}

		String normalized = rawCategory.trim().toUpperCase();
		if (normalized.equals("SIMPLE") || normalized.equals("WITHOUT_DEADLINE")) {
			return "WITHOUT_DEADLINE";
		}
		if (normalized.equals("DEADLINE") || normalized.equals("WITH_DEADLINE")) {
			return "WITH_DEADLINE";
		}

		throw new IllegalArgumentException("Invalid category");
	}

	private boolean isValidEmail(String value) {
		return value != null && EMAIL_REGEX.matcher(value.trim()).matches();
	}

	private boolean isStrongPassword(String password) {
		if (password == null || password.length() < 12) {
			return false;
		}
		return SPECIAL_CHAR_REGEX.matcher(password).find();
	}

	private String generateLoginCode() {
		int code = 100000 + RANDOM.nextInt(900000);
		return String.valueOf(code);
	}

	private String hashValue(String value) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
			StringBuilder builder = new StringBuilder();
			for (byte b : hash) {
				builder.append(String.format("%02x", b));
			}
			return builder.toString();
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 non disponible", e);
		}
	}

	private String maskEmail(String email) {
		if (email == null) {
			return "";
		}

		int atIndex = email.indexOf('@');
		if (atIndex <= 1) {
			return "***";
		}

		String local = email.substring(0, atIndex);
		String domain = email.substring(atIndex + 1);
		String visibleStart = local.substring(0, 1);
		String visibleEnd = local.substring(local.length() - 1);
		return visibleStart + "***" + visibleEnd + "@" + domain;
	}

	private void cleanupExpiredPendingLogins() {
		long now = System.currentTimeMillis();
		pendingLogins.entrySet().removeIf(entry -> entry.getValue().expiresAtMs < now);
	}

	private boolean sendLoginCodeEmail(String toEmail, String code) {
		String webhookUrl = System.getenv("TASK_LOGIN_MAIL_WEBHOOK_URL");
		String webhookToken = System.getenv("TASK_LOGIN_MAIL_WEBHOOK_TOKEN");

		if (webhookUrl == null || webhookUrl.isBlank()) {
			System.out.println("[AUTH 2FA] Code pour " + toEmail + " : " + code + " (mode dev, webhook non configure)");
			return true;
		}

		try {
			String payload = "{" +
					"\"to\":\"" + escapeJson(toEmail) + "\"," +
					"\"subject\":\"Code de connexion\"," +
					"\"text\":\"Votre code de connexion est: " + escapeJson(code) + ". Il expire dans 10 minutes.\"" +
					"}";

			HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
					.uri(URI.create(webhookUrl))
					.header("Content-Type", "application/json")
					.POST(HttpRequest.BodyPublishers.ofString(payload));

			if (webhookToken != null && !webhookToken.isBlank()) {
				requestBuilder.header("Authorization", "Bearer " + webhookToken);
			}

			HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());
			return response.statusCode() >= 200 && response.statusCode() < 300;
		} catch (IOException | InterruptedException e) {
			if (e instanceof InterruptedException) {
				Thread.currentThread().interrupt();
			}
			return false;
		}
	}
}
