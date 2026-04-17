package repository;

import model.Task;

import java.sql.Connection;
import java.sql.Date;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class DatabaseManager {
    public static class AuthUser {
        private final int id;
        private final String username;
        private final String role;

        public AuthUser(int id, String username, String role) {
            this.id = id;
            this.username = username;
            this.role = role;
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
                    Date deadlineValue = resultSet.getDate("deadline");
                    String rawCategory = resultSet.getString("category");
                    String category = normalizeCategory(rawCategory, deadlineValue == null ? null : deadlineValue.toLocalDate());
                    tasks.add(new Task(
                            resultSet.getInt("id"),
                            resultSet.getString("title"),
                            resultSet.getString("description"),
                            resultSet.getBoolean("state"),
                            resultSet.getString("priority"),
                            resultSet.getString("subject_name"),
                            deadlineValue == null ? null : deadlineValue.toLocalDate(),
                            category
                    ));
                }
            }
        }

        return tasks;
    }

    public int insertTask(Task task, int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();

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
                    return resultSet.getInt("id");
                }
            }
        }

        return 0;
    }

    public boolean completeTask(int id, int userId) throws SQLException {
        ensureSecuritySchema();

        String sql = "UPDATE task SET state = TRUE WHERE id = ? AND user_id = ?";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, id);
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }

    public boolean deleteTask(int id, int userId) throws SQLException {
        ensureSecuritySchema();

        String sql = "DELETE FROM task WHERE id = ? AND user_id = ?";

        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, id);
            statement.setInt(2, userId);
            return statement.executeUpdate() > 0;
        }
    }

    public boolean updateTask(Task task, int userId) throws SQLException {
        ensureCategoryColumn();
        ensureSecuritySchema();

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
            return statement.executeUpdate() > 0;
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

        String insertSql = "INSERT INTO app_user (username, password, role) VALUES (?, ?, ?) RETURNING id, role";
        try (Connection connection = openConnection();
             PreparedStatement insertStatement = connection.prepareStatement(insertSql)) {
            insertStatement.setString(1, username);
            insertStatement.setString(2, password);
            insertStatement.setString(3, "USER");
            try (ResultSet rs = insertStatement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(rs.getInt("id"), username, rs.getString("role"));
                }
            }
        }

        return null;
    }

    public AuthUser authenticateUser(String username, String password) throws SQLException {
        ensureSecuritySchema();

        String sql = "SELECT id, role FROM app_user WHERE username = ? AND password = ?";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, username);
            statement.setString(2, password);

            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    return new AuthUser(rs.getInt("id"), username, rs.getString("role"));
                }
            }
        }

        return null;
    }

    private void ensureCategoryColumn() throws SQLException {
        String sql = "ALTER TABLE task ADD COLUMN IF NOT EXISTS category VARCHAR(40)";
        try (Connection connection = openConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.execute();
        }
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

        try (Connection connection = openConnection();
             PreparedStatement createUserStatement = connection.prepareStatement(createUserSql);
             PreparedStatement seedAdminStatement = connection.prepareStatement(seedAdminSql);
             PreparedStatement seedUserStatement = connection.prepareStatement(seedUserSql);
             PreparedStatement addOwnerStatement = connection.prepareStatement(addOwnerSql);
             PreparedStatement backfillStatement = connection.prepareStatement(backfillSql);
             PreparedStatement setNotNullStatement = connection.prepareStatement(setNotNullSql)) {
            createUserStatement.execute();
            seedAdminStatement.execute();
            seedUserStatement.execute();
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
}
