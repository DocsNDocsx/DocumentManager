CREATE TABLE IF NOT EXISTS team_project_collaborators (
  id          VARCHAR(36)  NOT NULL,
  project_id  VARCHAR(36)  NOT NULL,
  user_id     INT          NULL,
  first_name  VARCHAR(255) NOT NULL DEFAULT '',
  last_name   VARCHAR(255) NOT NULL DEFAULT '',
  email       VARCHAR(255) NOT NULL DEFAULT '',
  affiliation VARCHAR(255) NOT NULL DEFAULT '',
  role        ENUM('supervisor', 'contributor') NOT NULL DEFAULT 'contributor',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_tpc_project FOREIGN KEY (project_id) REFERENCES team_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_tpc_user    FOREIGN KEY (user_id)    REFERENCES users (userid)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
