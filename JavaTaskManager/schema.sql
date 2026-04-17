CREATE DATABASE task_manager;

\c task_manager;

CREATE TABLE IF NOT EXISTS subject (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS task (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL,
    state BOOLEAN NOT NULL DEFAULT FALSE,
    deadline DATE,
    subject_id INTEGER REFERENCES subject(id)
);