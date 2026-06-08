-- Migration: 001_create_projects_table.sql
-- Creates the `projects` table for the 6-step project creation wizard.
-- Stores per-project metadata, wizard progress, collaborators, documents,
-- assignments, and status. Safe to re-run thanks to IF NOT EXISTS.

USE docsndocs;

CREATE TABLE IF NOT EXISTS projects (
  id             VARCHAR(36)  NOT NULL,
  user_id        INT          NOT NULL,
  name           VARCHAR(500) NOT NULL DEFAULT '',
  description    TEXT,
  deadline       DATE,
  attachments    JSON         NOT NULL,
  collaborators  JSON         NOT NULL,
  documents      JSON         NOT NULL,
  assignments    JSON         NOT NULL,
  staff          JSON,
  completed_step TINYINT      NOT NULL DEFAULT 0,
  status         VARCHAR(20)  NOT NULL DEFAULT 'draft',
  type           VARCHAR(20)  NOT NULL DEFAULT 'private',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users (userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_projects_user_id ON projects (user_id);
