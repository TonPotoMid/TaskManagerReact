package model;

import java.time.LocalDate;
import java.time.LocalDateTime;

public class TaskHistory {
    private final int id;
    private final int taskId;
    private final String action;
    private final LocalDateTime changedAt;
    private final String title;
    private final String description;
    private final String priority;
    private final boolean completed;
    private final LocalDate deadline;
    private final String category;
    private final String subjectName;

    public TaskHistory(
            int id,
            int taskId,
            String action,
            LocalDateTime changedAt,
            String title,
            String description,
            String priority,
            boolean completed,
            LocalDate deadline,
            String category,
            String subjectName
    ) {
        this.id = id;
        this.taskId = taskId;
        this.action = action;
        this.changedAt = changedAt;
        this.title = title;
        this.description = description;
        this.priority = priority;
        this.completed = completed;
        this.deadline = deadline;
        this.category = category;
        this.subjectName = subjectName;
    }

    public int getId() {
        return id;
    }

    public int getTaskId() {
        return taskId;
    }

    public String getAction() {
        return action;
    }

    public LocalDateTime getChangedAt() {
        return changedAt;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getPriority() {
        return priority;
    }

    public boolean isCompleted() {
        return completed;
    }

    public LocalDate getDeadline() {
        return deadline;
    }

    public String getCategory() {
        return category;
    }

    public String getSubjectName() {
        return subjectName;
    }
}