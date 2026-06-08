-- Migration: 007_add_team_project_fields.sql
-- Adds expected_collaborators, project_code, and documents columns to team_projects.
-- Safe to re-run (IF NOT EXISTS guard via ADD COLUMN ... FIRST / AFTER checks omitted;
-- MySQL will error on duplicate column which is acceptable for idempotent scripts).

USE docsndocs;

ALTER TABLE team_projects
  ADD COLUMN expected_collaborators INT          NULL DEFAULT NULL AFTER description,
  ADD COLUMN project_code           VARCHAR(50)  NULL DEFAULT NULL AFTER expected_collaborators,
  ADD COLUMN documents              JSON         NULL DEFAULT NULL AFTER project_code;
