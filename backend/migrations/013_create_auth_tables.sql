-- Migration: 013_create_auth_tables.sql
-- Persistent OTP and password-reset token storage (replaces in-memory Maps).

USE docsndocs;

CREATE TABLE IF NOT EXISTS otp_store (
  email      VARCHAR(255) NOT NULL,
  otp        INT          NOT NULL,
  expires_at DATETIME     NOT NULL,
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash VARCHAR(64)  NOT NULL,
  email      VARCHAR(255) NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
