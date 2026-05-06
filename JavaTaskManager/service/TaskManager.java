package service;

import model.Task;
import model.TaskHistory;
import repository.DatabaseManager;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class TaskManager {
	private final DatabaseManager databaseManager;

	public static class AuthUser {
		private final int id;
		private final String username;
		private final String role;
		private final String avatarUrl;
		private final String displayName;

		public AuthUser(int id, String username, String role, String avatarUrl, String displayName) {
			this.id = id;
			this.username = username;
			this.role = role;
			this.avatarUrl = avatarUrl;
			this.displayName = displayName;
		}

		public int getId() {
			return id;
		}

		public String getUsername() {
			return username;
		}

		public String getRole() {
			return role;
		}

		public String getAvatarUrl() {
			return avatarUrl;
		}

		public String getDisplayName() {
			return displayName;
		}
	}

	public TaskManager() {
		this.databaseManager = DatabaseManager.getInstance();
	}

	public List<Task> getAllTasks(int userId) throws SQLException {
		return databaseManager.loadTasksByUser(userId);
	}

	public int createTask(Task task, int userId) throws SQLException {
		return databaseManager.insertTask(task, userId);
	}

	public boolean completeTask(int id, int userId) throws SQLException {
		return databaseManager.completeTask(id, userId);
	}

	public boolean deleteTask(int id, int userId) throws SQLException {
		return databaseManager.deleteTask(id, userId);
	}

	public boolean updateTask(Task task, int userId) throws SQLException {
		return databaseManager.updateTask(task, userId);
	}

	public List<TaskHistory> getTaskHistory(int taskId, int userId) throws SQLException {
		return databaseManager.loadTaskHistory(taskId, userId);
	}

	public boolean updateAvatarUrl(int userId, String avatarUrl) throws SQLException {
		return databaseManager.updateUserAvatarUrl(userId, avatarUrl);
	}

	public boolean updateDisplayName(int userId, String displayName) throws SQLException {
		return databaseManager.updateUserDisplayName(userId, displayName);
	}

	public AuthUser getAuthUserById(int userId) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.loadAuthUserById(userId);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl(), user.getDisplayName());
	}

	public AuthUser getAuthUserByUsername(String username) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.loadAuthUserByUsername(username);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl(), user.getDisplayName());
	}

	public boolean updatePassword(int userId, String newPassword) throws SQLException {
		return databaseManager.updateUserPassword(userId, newPassword);
	}

	public AuthUser register(String username, String password) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.registerUser(username, password);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl(), user.getDisplayName());
	}

	public AuthUser login(String username, String password) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.authenticateUser(username, password);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl(), user.getDisplayName());
	}

	public static class UserSummary {
		private final int id;
		private final String username;
		private final String role;
		private final String displayName;

		public UserSummary(int id, String username, String role, String displayName) {
			this.id = id;
			this.username = username;
			this.role = role;
			this.displayName = displayName;
		}

		public int getId() { return id; }
		public String getUsername() { return username; }
		public String getRole() { return role; }
		public String getDisplayName() { return displayName; }
	}

	public List<UserSummary> listAllUsers() throws SQLException {
		List<DatabaseManager.UserSummary> users = databaseManager.listAllUsers();
		List<UserSummary> result = new ArrayList<>(users.size());
		for (DatabaseManager.UserSummary u : users) {
			result.add(new UserSummary(u.getId(), u.getUsername(), u.getRole(), u.getDisplayName()));
		}
		return result;
	}

	public boolean deleteUser(int userId) throws SQLException {
		return databaseManager.deleteUserById(userId);
	}

	public boolean updateUserRole(int userId, String role) throws SQLException {
		return databaseManager.updateUserRole(userId, role);
	}
}
