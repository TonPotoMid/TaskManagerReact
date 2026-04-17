package model;

import java.time.LocalDate;

public class Task {
    private int id;
    private String title;
    private String description;
    private boolean completed;
    private String priority;
    private String subjectName;
    private LocalDate deadline;
    private String category;

    public Task(int id, String title, String description, boolean completed) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.completed = completed;
        this.priority = "MEDIUM";
        this.subjectName = null;
        this.deadline = null;
        this.category = "WITHOUT_DEADLINE";
    }

    public Task(int id, String title, String description, boolean completed, String priority, String subjectName, LocalDate deadline, String category) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.completed = completed;
        this.priority = priority;
        this.subjectName = subjectName;
        this.deadline = deadline;
        this.category = category;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public void setSubjectName(String subjectName) {
        this.subjectName = subjectName;
    }

    public LocalDate getDeadline() {
        return deadline;
    }

    public void setDeadline(LocalDate deadline) {
        this.deadline = deadline;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    // Backward compatibility for existing code paths still using 'type'.
    public String getType() {
        return category;
    }

    // Backward compatibility for existing code paths still using 'type'.
    public void setType(String type) {
        this.category = type;
    }
}
