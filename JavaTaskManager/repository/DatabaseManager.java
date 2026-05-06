package repository;

import model.Task;
import model.TaskHistory;

import java.sql.Connection;
import java.sql.Date;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

public class DatabaseManager {
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

    private static DatabaseManager instance;
    private static final String DEFAULT_URL = "jdbc:postgresql://localhost:5432/postgres";
    private static final String DEFAULT_USER = "postgres";
    private static final String DEFAULT_PASSWORD = "postgres";

    private DatabaseManager() {
        // Private constructor to prevent instantiation.
    }

    public static synchronized DatabaseManager getInstance() {
        if (instance == null) {
            instance = new DatabaseManager();
        }
        return instance;
    }

    public List<Task> loadTasksByUser(int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();
        ensureHistorySchema();

        List<Task> tasks = new ArrayList<>();
        String sql = "SELECT t.id, t.title, t.description, t.priority, t.state, t.deadline, t.category, " +
                "s.name AS subject_name FROM task t " +
                "LEFT JOIN subject s ON s.id = t.subject_id " +
                "WHERE t.user_id = ? " +
                "ORDER BY t.id";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, userId);

            try (ResultSet resultSet = statement.executeQuery()) {
                while (resultSet.next()) {
                    tasks.add(mapTask(resultSet));
                }
            }
        }

        return tasks;
    }

    public List<TaskHistory> loadTaskHistory(int taskId, int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();
        ensureHistorySchema();

        List<TaskHistory> history = new ArrayList<>();
        String sql = "SELECT id, task_id, action, changed_at, title, description, priority, state, deadline, category, subject_name " +
                "FROM task_history WHERE task_id = ? AND user_id = ? ORDER BY changed_at DESC, id DESC";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, taskId);
            statement.setInt(2, userId);

            try (ResultSet resultSet = statement.executeQuery()) {
                while (resultSet.next()) {
                    Timestamp changedAt = resultSet.getTimestamp("changed_at");
                    Date deadline = resultSet.getDate("deadline");
                    history.add(new TaskHistory(
                            resultSet.getInt("id"),
                            resultSet.getInt("task_id"),
                            resultSet.getString("action"),
                            changedAt == null ? null : changedAt.toLocalDateTime(),
                            resultSet.getString("title"),
                            resultSet.getString("description"),
                            resultSet.getString("priority"),
                            resultSet.getBoolean("state"),
                            deadline == null ? null : deadline.toLocalDate(),
                            resultSet.getString("category"),
                            resultSet.getString("subject_name")
                    ));
                }
            }
        }

        return history;
    }

    public int insertTask(Task task, int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();
        ensureHistorySchema();

        String sql = "INSERT INTO task (title, description, priority, state, deadline, category, subject_id, user_id) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, task.getTitle());
            statement.setString(2, task.getDescription());
            statement.setString(3, task.getPriority() == null ? "MEDIUM" : task.getPriority());
            statement.setBoolean(4, task.isCompleted());

            if (task.getDeadline() == null) {
                statement.setDate(5, null);
            } else {
                statement.setDate(5, Date.valueOf(task.getDeadline()));
            }

            statement.setString(6, normalizeCategory(task.getCategory(), task.getDeadline()));

            Integer subjectId = getOrCreateSubjectId(connection, task.getSubjectName());
            if (subjectId == null) {
                statement.setObject(7, null);
            } else {
                statement.setInt(7, subjectId);
            }

            statement.setInt(8, userId);

            try (ResultSet resultSet = statement.executeQuery()) {
                if (resultSet.next()) {
                    int id = resultSet.getInt("id");
                    task.setId(id);
                    recordTaskHistory(connection, task, userId, "CREATED");
                    return id;
                }
            }
        }

        return 0;
    }

    public boolean completeTask(int id, int userId) throws SQLException {
        ensureSecuritySchema();
        ensureCategoryColumn();
        ensureHistorySchema();

        String sql = "UPDATE task SET state = TRUE WHERE id = ? AND user_id = ?";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            Task existing = loadTaskById(connection, id, userId);
            if (existing == null) {
                return false;
            }

            statement.setInt(1, id);
            statement.setInt(2, userId);
            boolean updated = statement.executeUpdate() > 0;
            if (updated) {
                Task updatedTask = loadTaskById(connection, id, userId);
                if (updatedTask != null) {
                    recordTaskHistory(connection, updatedTask, userId, "COMPLETED");
                }
            }
            return updated;
        }
    }

    public boolean deleteTask(int id, int userId) throws SQLException {
        ensureSecuritySchema();
        ensureCategoryColumn();
        ensureHistorySchema();

        String sql = "DELETE FROM task WHERE id = ? AND user_id = ?";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            Task existing = loadTaskById(connection, id, userId);
            if (existing == null) {
                return false;
            }

            statement.setInt(1, id);
            statement.setInt(2, userId);
            boolean deleted = statement.executeUpdate() > 0;
            if (deleted) {
                recordTaskHistory(connection, existing, userId, "DELETED");
            }
            return deleted;
        }
    }

    public boolean updateTask(Task task, int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();
        ensureHistorySchema();

        String sql = "UPDATE task SET title = ?, description = ?, priority = ?, state = ?, deadline = ?, category = ?, subject_id = ? " +
                "WHERE id = ? AND user_id = ?";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, task.getTitle());
            statement.setString(2, task.getDescription());
            statement.setString(3, task.getPriority() == null ? "MEDIUM" : task.getPriority());
            statement.setBoolean(4, task.isCompleted());

            if (task.getDeadline() == null) {
                statement.setDate(5, null);
            } else {
                statement.setDate(5, Date.valueOf(task.getDeadline()));
            }

            statement.setString(6, normalizeCategory(task.getCategory(), task.getDeadline()));

            Integer subjectId = getOrCreateSubjectId(connection, task.getSubjectName());
            if (subjectId == null) {
                statement.setObject(7, null);
            } else {
                statement.setInt(7, subjectId);
            }

            statement.setInt(8, task.getId());
            statement.setInt(9, userId);
            boolean updated = statement.executeUpdate() > 0;
            if (updated) {
                Task updatedTask = loadTaskById(connection, task.getId(), userId);
                if (updatedTask != null) {
                    recordTaskHistory(connection, updatedTask, userId, "UPDATED");
                }
            }
            return updated;
        }
    }

    public AuthUser registerUser(String username, String password) throws SQLException {
        ensureSecuritySchema();

        String existingSql = "SELECT id FROM app_user WHERE username = ?";
        try (Connection connection = openConnection();
             PreparedStatement existingStatement = connection.prepareStatement(existingSql)) {
            existingStatement.setString(1, username);
            try (ResultSet rs = existingStatement.executeQuery()) {
                if (rs.next()) {
                    return null;
                }
            }
        }

        String insertSql = "INSERT INTO app_user (username, password, role) VALUES (?, ?, ?) RETURNING id, role, avatar_url, display_name";
        try (Connection connection = openConnection();
             PreparedStatement insertStatement = connection.prepareStatement(insertSql)) {
            insertStatement.setString(1, username);
            insertStatement.setString(2, password);
            insertStatement.setString(3, "USER");
            try (ResultSet rs = insertStatement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(rs.getInt("id"), username, rs.getString("role"), rs.getString("avatar_url"), rs.getString("display_name"));
                }
            }
        }

        return null;
    }

    public AuthUser authenticateUser(String username, String password) throws SQLException {
        ensureSecuritySchema();

        String sql = "SELECT id, role, avatar_url, display_name FROM app_user WHERE username = ? AND password = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, username);
            statement.setString(2, password);

            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(rs.getInt("id"), username, rs.getString("role"), rs.getString("avatar_url"), rs.getString("display_name"));
                }
            }
        }

        return null;
    }

    public boolean updateUserDisplayName(int userId, String displayName) throws SQLException {
        ensureSecuritySchema();
        String sql = "UPDATE app_user SET display_name = ? WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, displayName == null || displayName.isBlank() ? null : displayName.trim());
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }

    public boolean updateUserAvatarUrl(int userId, String avatarUrl) throws SQLException {
        ensureSecuritySchema();

        String sql = "UPDATE app_user SET avatar_url = ? WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            if (avatarUrl == null || avatarUrl.isBlank()) {
                statement.setString(1, null);
            } else {
                statement.setString(1, avatarUrl.trim());
            }
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }

    public AuthUser loadAuthUserById(int userId) throws SQLException {
        ensureSecuritySchema();

        String sql = "SELECT id, username, role, avatar_url, display_name FROM app_user WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, userId);
            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(rs.getInt("id"), rs.getString("username"), rs.getString("role"), rs.getString("avatar_url"), rs.getString("display_name"));
                }
            }
        }

        return null;
    }

    public AuthUser loadAuthUserByUsername(String username) throws SQLException {
        ensureSecuritySchema();

        String sql = "SELECT id, username, role, avatar_url, display_name FROM app_user WHERE username = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, username);
            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(
                            rs.getInt("id"),
                            rs.getString("username"),
                            rs.getString("role"),
                            rs.getString("avatar_url"),
                            rs.getString("display_name")
                    );
                }
            }
        }

        return null;
    }

    public boolean updateUserPassword(int userId, String newPassword) throws SQLException {
        ensureSecuritySchema();

        String sql = "UPDATE app_user SET password = ? WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, newPassword);
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }

    private void ensureCategoryColumn() throws SQLException {
        String sql = "ALTER TABLE task ADD COLUMN IF NOT EXISTS category VARCHAR(40)";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.execute();
        }
    }

    private void ensureHistorySchema() throws SQLException {
        String createHistorySql = "CREATE TABLE IF NOT EXISTS task_history (" +
                "id SERIAL PRIMARY KEY, " +
                "task_id INTEGER NOT NULL, " +
                "user_id INTEGER NOT NULL REFERENCES app_user(id), " +
                "action VARCHAR(30) NOT NULL, " +
                "changed_at TIMESTAMP NOT NULL DEFAULT NOW(), " +
                "title VARCHAR(150) NOT NULL, " +
                "description TEXT NOT NULL, " +
                "priority VARCHAR(20) NOT NULL, " +
                "state BOOLEAN NOT NULL, " +
                "deadline DATE, " +
                "category VARCHAR(40), " +
                "subject_name VARCHAR(100)" +
                ")";

        String taskHistoryTaskIdIndexSql = "CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id)";
        String taskHistoryUserIdIndexSql = "CREATE INDEX IF NOT EXISTS idx_task_history_user_id ON task_history(user_id)";

        try (Connection connection = openConnection();
             PreparedStatement createStatement = connection.prepareStatement(createHistorySql);
             PreparedStatement taskIndexStatement = connection.prepareStatement(taskHistoryTaskIdIndexSql);
             PreparedStatement userIndexStatement = connection.prepareStatement(taskHistoryUserIdIndexSql)) {
            createStatement.execute();
            taskIndexStatement.execute();
            userIndexStatement.execute();
        }
    }

    private void recordTaskHistory(Connection connection, Task task, int userId, String action) throws SQLException {
        String sql = "INSERT INTO task_history (task_id, user_id, action, changed_at, title, description, priority, state, deadline, category, subject_name) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, task.getId());
            statement.setInt(2, userId);
            statement.setString(3, action);
            statement.setTimestamp(4, Timestamp.valueOf(LocalDateTime.now()));
            statement.setString(5, task.getTitle());
            statement.setString(6, task.getDescription());
            statement.setString(7, task.getPriority() == null ? "MEDIUM" : task.getPriority());
            statement.setBoolean(8, task.isCompleted());
            if (task.getDeadline() == null) {
                statement.setDate(9, null);
            } else {
                statement.setDate(9, Date.valueOf(task.getDeadline()));
            }
            statement.setString(10, normalizeCategory(task.getCategory(), task.getDeadline()));
            statement.setString(11, task.getSubjectName());
            statement.executeUpdate();
        }
    }

    private Task loadTaskById(Connection connection, int taskId, int userId) throws SQLException {
        String sql = "SELECT t.id, t.title, t.description, t.priority, t.state, t.deadline, t.category, " +
                "s.name AS subject_name FROM task t " +
                "LEFT JOIN subject s ON s.id = t.subject_id " +
                "WHERE t.id = ? AND t.user_id = ?";

        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, taskId);
            statement.setInt(2, userId);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (resultSet.next()) {
                    return mapTask(resultSet);
                }
            }
        }

        return null;
    }

    private Task mapTask(ResultSet resultSet) throws SQLException {
        Date deadlineValue = resultSet.getDate("deadline");
        String rawCategory = resultSet.getString("category");
        String category = normalizeCategory(rawCategory, deadlineValue == null ? null : deadlineValue.toLocalDate());
        return new Task(
                resultSet.getInt("id"),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getBoolean("state"),
                resultSet.getString("priority"),
                resultSet.getString("subject_name"),
                deadlineValue == null ? null : deadlineValue.toLocalDate(),
                category
        );
    }

    private void ensureSecuritySchema() throws SQLException {
        String createUserSql = "CREATE TABLE IF NOT EXISTS app_user (" +
                "id SERIAL PRIMARY KEY, " +
                "username VARCHAR(120) NOT NULL UNIQUE, " +
                "password VARCHAR(255) NOT NULL, " +
                "role VARCHAR(30) NOT NULL DEFAULT 'USER'" +
                ")";

        String addOwnerSql = "ALTER TABLE task ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES app_user(id)";

        String backfillSql = "UPDATE task SET user_id = (SELECT id FROM app_user WHERE username = 'admin') WHERE user_id IS NULL";
        String setNotNullSql = "ALTER TABLE task ALTER COLUMN user_id SET NOT NULL";

        String seedAdminSql = "INSERT INTO app_user (username, password, role) VALUES ('admin', 'admin123', 'ADMIN') ON CONFLICT (username) DO NOTHING";
        String seedUserSql = "INSERT INTO app_user (username, password, role) VALUES ('user', 'user123', 'USER') ON CONFLICT (username) DO NOTHING";
           String addAvatarSql = "ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1000)";
        String addDisplayNameSql = "ALTER TABLE app_user ADD COLUMN IF NOT EXISTS display_name VARCHAR(120)";

        try (Connection connection = openConnection();
             PreparedStatement createUserStatement = connection.prepareStatement(createUserSql);
             PreparedStatement seedAdminStatement = connection.prepareStatement(seedAdminSql);
             PreparedStatement seedUserStatement = connection.prepareStatement(seedUserSql);
               PreparedStatement addAvatarStatement = connection.prepareStatement(addAvatarSql);
             PreparedStatement addDisplayNameStatement = connection.prepareStatement(addDisplayNameSql);
             PreparedStatement addOwnerStatement = connection.prepareStatement(addOwnerSql);
             PreparedStatement backfillStatement = connection.prepareStatement(backfillSql);
             PreparedStatement setNotNullStatement = connection.prepareStatement(setNotNullSql)) {
            createUserStatement.execute();
            seedAdminStatement.execute();
            seedUserStatement.execute();
              addAvatarStatement.execute();
            addDisplayNameStatement.execute();
            addOwnerStatement.execute();
            backfillStatement.execute();
            try {
                setNotNullStatement.execute();
            } catch (SQLException ignored) {
                // Ignore if existing rows still violate the constraint in older schemas.
            }
        }
    }

    private String normalizeCategory(String rawCategory, java.time.LocalDate deadline) {
        if (rawCategory == null || rawCategory.isBlank()) {
            return deadline == null ? "WITHOUT_DEADLINE" : "WITH_DEADLINE";
        }

        String normalized = rawCategory.trim().toUpperCase();
        if (normalized.equals("SIMPLE")) {
            return "WITHOUT_DEADLINE";
        }
        if (!normalized.equals("WITHOUT_DEADLINE") && !normalized.equals("WITH_DEADLINE")) {
            return deadline == null ? "WITHOUT_DEADLINE" : "WITH_DEADLINE";
        }

        return normalized;
    }

    private Integer getOrCreateSubjectId(Connection connection, String subjectName) throws SQLException {
        if (subjectName == null || subjectName.isBlank()) {
            return null;
        }

        String selectSql = "SELECT id FROM subject WHERE name = ?";
        try (PreparedStatement selectStatement = connection.prepareStatement(selectSql)) {
            selectStatement.setString(1, subjectName);
            try (ResultSet resultSet = selectStatement.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getInt("id");
                }
            }
        }

        String insertSql = "INSERT INTO subject (name) VALUES (?) RETURNING id";
        try (PreparedStatement insertStatement = connection.prepareStatement(insertSql)) {
            insertStatement.setString(1, subjectName);
            try (ResultSet resultSet = insertStatement.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getInt("id");
                }
            }
        }

        return null;
    }

    private Connection openConnection() throws SQLException {
        return DriverManager.getConnection(
                resolveSetting("task.db.url", "TASK_DB_URL", DEFAULT_URL),
                resolveSetting("task.db.user", "TASK_DB_USER", DEFAULT_USER),
                resolveSetting("task.db.password", "TASK_DB_PASSWORD", DEFAULT_PASSWORD)
        );
    }

    private String resolveSetting(String propertyKey, String envKey, String defaultValue) {
        String systemValue = System.getProperty(propertyKey);
        if (systemValue != null && !systemValue.isBlank()) {
            return systemValue;
        }

        String envValue = System.getenv(envKey);
        if (envValue != null && !envValue.isBlank()) {
            return envValue;
        }

        return defaultValue;
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
        ensureSecuritySchema();
        String sql = "SELECT id, username, role, display_name FROM app_user ORDER BY id";
        List<UserSummary> users = new ArrayList<>();
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            try (ResultSet rs = statement.executeQuery()) {
                while (rs.next()) {
                    users.add(new UserSummary(
                            rs.getInt("id"),
                            rs.getString("username"),
                            rs.getString("role"),
                            rs.getString("display_name")
                    ));
                }
            }
        }
        return users;
    }

    public boolean deleteUserById(int userId) throws SQLException {
        ensureSecuritySchema();
        String sql = "DELETE FROM app_user WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, userId);
            return statement.executeUpdate() > 0;
        }
    }

    public boolean updateUserRole(int userId, String role) throws SQLException {
        ensureSecuritySchema();
        String sql = "UPDATE app_user SET role = ? WHERE id = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, role);
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }
}
