package service;

import model.Task;
import model.TaskHistory;
import repository.DatabaseManager;

import java.sql.SQLException;
import java.util.List;

public class TaskManager {
	private final DatabaseManager databaseManager;

	public static class AuthUser {
		private final int id;
		private final String username;
		private final String role;
		private final String avatarUrl;

		public AuthUser(int id, String username, String role, String avatarUrl) {
			this.id = id;
			this.username = username;
			this.role = role;
			this.avatarUrl = avatarUrl;
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

	public AuthUser getAuthUserById(int userId) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.loadAuthUserById(userId);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl());
	}

	public AuthUser register(String username, String password) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.registerUser(username, password);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl());
	}

	public AuthUser login(String username, String password) throws SQLException {
		DatabaseManager.AuthUser user = databaseManager.authenticateUser(username, password);
		if (user == null) {
			return null;
		}
		return new AuthUser(user.getId(), user.getUsername(), user.getRole(), user.getAvatarUrl());
	}
}
