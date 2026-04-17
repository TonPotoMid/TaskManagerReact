package controller;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import model.Task;
import service.TaskManager;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TaskController {
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

	public TaskController(int port) throws IOException {
		this.taskManager = new TaskManager();
		this.sessions = new ConcurrentHashMap<>();
		this.server = HttpServer.create(new InetSocketAddress(port), 0);
		this.server.createContext("/api/auth/login", new LoginHandler());
		this.server.createContext("/api/auth/register", new RegisterHandler());
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

				TaskManager.AuthUser user = taskManager.login(username, password);
				if (user == null) {
					writeJson(exchange, 401, "{\"error\":\"Invalid credentials\"}");
					return;
				}

				String token = UUID.randomUUID().toString();
				sessions.put(token, new Session(user.getId(), user.getUsername(), user.getRole()));
				writeJson(exchange, 200,
						"{\"token\":\"" + escapeJson(token) + "\",\"username\":\"" + escapeJson(user.getUsername()) + "\",\"role\":\"" + escapeJson(user.getRole()) + "\"}");
			} catch (SQLException e) {
				writeJson(exchange, 500, "{\"error\":\"Database error\"}");
			}
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

				TaskManager.AuthUser user = taskManager.register(username, password);
				if (user == null) {
					writeJson(exchange, 409, "{\"error\":\"Username already exists\"}");
					return;
				}

				String token = UUID.randomUUID().toString();
				sessions.put(token, new Session(user.getId(), user.getUsername(), user.getRole()));
				writeJson(exchange, 201,
						"{\"token\":\"" + escapeJson(token) + "\",\"username\":\"" + escapeJson(user.getUsername()) + "\",\"role\":\"" + escapeJson(user.getRole()) + "\"}");
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
}
