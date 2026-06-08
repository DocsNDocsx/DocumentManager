-- Migration: 011_create_team_project_submissions.sql
-- Stores document submissions made by team project collaborators.

USE docsndocs;

CREATE TABLE IF NOT EXISTS team_project_submissions (
  id              VARCHAR(36)    NOT NULL,
  project_id      VARCHAR(36)    NOT NULL,
  collaborator_id VARCHAR(36)    NOT NULL,
  document_index  INT            NOT NULL,
  file_name       VARCHAR(500)   NOT NULL,
  file_size       BIGINT         NOT NULL,
  file_path       VARCHAR(1000)  NOT NULL,
  status          ENUM('submitted','approved','revision') NOT NULL DEFAULT 'submitted',
  feedback        TEXT           NULL,
  submitted_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_tps_collab_doc (project_id, collaborator_id, document_index),
  CONSTRAINT fk_tps_project      FOREIGN KEY (project_id)     REFERENCES team_projects              (id) ON DELETE CASCADE,
  CONSTRAINT fk_tps_collaborator FOREIGN KEY (collaborator_id) REFERENCES team_project_collaborators (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

