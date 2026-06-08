USE docsndocs;

CREATE TABLE IF NOT EXISTS activity_log (
  id           VARCHAR(36)    NOT NULL,
  user_id      INT            NOT NULL,
  type         VARCHAR(50)    NOT NULL,
  title        VARCHAR(1000)  NOT NULL,
  actor        VARCHAR(255)   NULL,
  created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_activity_log_user FOREIGN KEY (user_id) REFERENCES users (userid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_activity_log_user_id ON activity_log (user_id);
