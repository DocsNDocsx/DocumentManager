-- Migration: 004_create_teams_tables.sql
-- Creates `teams` and `team_members` tables.
-- Safe to re-run thanks to IF NOT EXISTS / IF NOT EXISTS guards.

USE docsndocs;

CREATE TABLE IF NOT EXISTS teams (
  id          VARCHAR(36)  NOT NULL,
  user_id     INT          NOT NULL,
  name        VARCHAR(500) NOT NULL DEFAULT '',
  description TEXT,
  icon        VARCHAR(100) NOT NULL DEFAULT 'fa-users',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_teams_user FOREIGN KEY (user_id) REFERENCES users (userid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_teams_user_id ON teams (user_id);

CREATE TABLE IF NOT EXISTS team_members (
  id          VARCHAR(36)  NOT NULL,
  team_id     VARCHAR(36)  NOT NULL,
  user_id     INT,
  first_name  VARCHAR(100) NOT NULL DEFAULT '',
  last_name   VARCHAR(100) NOT NULL DEFAULT '',
  email       VARCHAR(255) NOT NULL DEFAULT '',
  affiliation VARCHAR(255) NOT NULL DEFAULT '',
  is_owner    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_team_members_team_id ON team_members (team_id);
CREATE INDEX idx_team_members_user_id ON team_members (user_id);
