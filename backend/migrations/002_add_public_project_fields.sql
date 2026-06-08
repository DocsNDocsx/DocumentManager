-- Migration: 002_add_public_project_fields.sql
-- Adds expected_collaborators and project_code columns for public projects.

USE docsndocs;

ALTER TABLE projects
  ADD COLUMN expected_collaborators INT DEFAULT NULL AFTER staff,
  ADD COLUMN project_code VARCHAR(20) DEFAULT NULL AFTER expected_collaborators;

CREATE INDEX idx_projects_code ON projects (project_code);
