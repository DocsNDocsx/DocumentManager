-- Migration: 003_create_submissions_table.sql
-- Tracks document submissions made by collaborators for a project.

USE docsndocs;

CREATE TABLE IF NOT EXISTS submissions (
  id                 VARCHAR(36)   NOT NULL,
  project_id         VARCHAR(36)   NOT NULL,
  collaborator_index INT           NOT NULL,
  document_index     INT           NOT NULL,
  file_name          VARCHAR(500)  NOT NULL,
  file_size          BIGINT        NOT NULL DEFAULT 0,
  file_path          VARCHAR(1000) NOT NULL,
  status             VARCHAR(20)   NOT NULL DEFAULT 'submitted',
  feedback           TEXT,
  submitted_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_collab_doc (project_id, collaborator_index, document_index),
  CONSTRAINT fk_submissions_project FOREIGN KEY (project_id) REFERENCES projects (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
