-- Migration: 005_create_team_projects_table.sql
-- Creates `team_projects` and `team_project_roles` tables.
-- Safe to re-run thanks to IF NOT EXISTS guards.

USE docsndocs;

CREATE TABLE IF NOT EXISTS team_projects (
  id          VARCHAR(36)   NOT NULL,
  team_id     VARCHAR(36)   NOT NULL,
  name        VARCHAR(500)  NOT NULL DEFAULT '',
  type        ENUM('private','public') NOT NULL DEFAULT 'private',
  status      ENUM('active','draft','completed','not_completed','deleted') NOT NULL DEFAULT 'draft',
  deadline    DATETIME      NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_team_projects_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_team_projects_team_id ON team_projects (team_id);

CREATE TABLE IF NOT EXISTS team_project_roles (
  id          VARCHAR(36)   NOT NULL,
  project_id  VARCHAR(36)   NOT NULL,
  user_id     INT           NOT NULL,
  role        ENUM('host','supervisor','contributor') NOT NULL DEFAULT 'contributor',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_team_project_roles_project FOREIGN KEY (project_id) REFERENCES team_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_team_project_roles_user    FOREIGN KEY (user_id)    REFERENCES users (userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_team_project_roles_project_id ON team_project_roles (project_id);
CREATE INDEX IF NOT EXISTS idx_team_project_roles_user_id    ON team_project_roles (user_id);
