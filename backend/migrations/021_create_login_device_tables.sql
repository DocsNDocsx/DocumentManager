USE docsndocs;

CREATE TABLE IF NOT EXISTS login_challenges (
  id          VARCHAR(64)  NOT NULL,
  user_id     BIGINT       NOT NULL,
  email       VARCHAR(255) NOT NULL,
  otp_hash    VARCHAR(64)  NOT NULL,
  expires_at  DATETIME     NOT NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_login_challenges_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trusted_devices (
  token_hash  VARCHAR(64)  NOT NULL,
  user_id     BIGINT       NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_ip    VARCHAR(64),
  last_ip     VARCHAR(64),
  user_agent  VARCHAR(500),
  PRIMARY KEY (token_hash),
  INDEX idx_trusted_devices_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
