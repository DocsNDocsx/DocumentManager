-- PostgreSQL schema for DashDoxs (Neon)
-- Run this entire file against your Neon database once to create all tables.
-- Replaces all MySQL migration files (001–012).

-- ─────────────────────────────────────────────────────────────────
-- Trigger function: replaces MySQL's ON UPDATE CURRENT_TIMESTAMP
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────
-- users
-- userid is app-generated (Math.floor(Date.now() / 1000))
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  userid        BIGINT        NOT NULL,
  firstname     VARCHAR(255),
  lastname      VARCHAR(255),
  email         VARCHAR(255)  NOT NULL,
  password      VARCHAR(255),
  designation   VARCHAR(255),
  organization  VARCHAR(255),
  issubscribed  VARCHAR(10)   NOT NULL DEFAULT 'false',
  avatar_url    VARCHAR(1000),
  avatar_data   TEXT,
  avatar_mime_type VARCHAR(255),
  avatar_filename  VARCHAR(500),
  phone         VARCHAR(50),
  timezone      VARCHAR(100),
  notif_pref    VARCHAR(100),

  PRIMARY KEY (userid),
  UNIQUE (email)
);

-- ─────────────────────────────────────────────────────────────────
-- payment_cards
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_cards (
  id            SERIAL        PRIMARY KEY,
  userid        BIGINT        NOT NULL REFERENCES users (userid) ON DELETE CASCADE,
  last4         VARCHAR(4)    NOT NULL,
  card_type     VARCHAR(50)   NOT NULL DEFAULT 'generic',
  card_holder   VARCHAR(255)  NOT NULL,
  expiry_month  INT           NOT NULL,
  expiry_year   INT           NOT NULL,
  is_default    BOOLEAN       NOT NULL DEFAULT FALSE,
  type          VARCHAR(20)   NOT NULL DEFAULT 'solo',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────
-- payment_history
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_history (
  id             SERIAL         PRIMARY KEY,
  userid         BIGINT         NOT NULL REFERENCES users (userid) ON DELETE CASCADE,
  invoice_no     VARCHAR(100)   NOT NULL,
  plan           VARCHAR(100)   NOT NULL,
  amount         NUMERIC(10,2)  NOT NULL,
  currency       VARCHAR(10)    NOT NULL DEFAULT 'USD',
  status         VARCHAR(20)    NOT NULL DEFAULT 'paid',
  payment_method VARCHAR(100),
  paid_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type           VARCHAR(20)    NOT NULL DEFAULT 'solo'
);

-- ─────────────────────────────────────────────────────────────────
-- projects  (migration 001 + 002)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                     VARCHAR(36)   NOT NULL,
  user_id                BIGINT        NOT NULL REFERENCES users (userid),
  name                   VARCHAR(500)  NOT NULL DEFAULT '',
  description            TEXT,
  deadline               DATE,
  attachments            JSONB         NOT NULL DEFAULT '[]',
  collaborators          JSONB         NOT NULL DEFAULT '[]',
  documents              JSONB         NOT NULL DEFAULT '[]',
  assignments            JSONB         NOT NULL DEFAULT '{}',
  staff                  JSONB,
  completed_step         SMALLINT      NOT NULL DEFAULT 0,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'draft',
  type                   VARCHAR(20)   NOT NULL DEFAULT 'private',
  expected_collaborators INT,
  project_code           VARCHAR(20),
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_code    ON projects (project_code);

CREATE OR REPLACE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- submissions  (migration 003)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id                 VARCHAR(36)   NOT NULL,
  project_id         VARCHAR(36)   NOT NULL REFERENCES projects (id),
  collaborator_index INT           NOT NULL,
  document_index     INT           NOT NULL,
  file_name          VARCHAR(500)  NOT NULL,
  file_size          BIGINT        NOT NULL DEFAULT 0,
  file_path          VARCHAR(1000) NOT NULL,
  status             VARCHAR(20)   NOT NULL DEFAULT 'submitted',
  feedback           TEXT,
  submitted_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE (project_id, collaborator_index, document_index)
);

CREATE OR REPLACE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- teams + team_members  (migration 004)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          VARCHAR(36)   NOT NULL,
  user_id     BIGINT        NOT NULL REFERENCES users (userid),
  name        VARCHAR(500)  NOT NULL DEFAULT '',
  description TEXT,
  icon        VARCHAR(100)  NOT NULL DEFAULT 'fa-users',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams (user_id);

CREATE OR REPLACE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS team_members (
  id          VARCHAR(36)   NOT NULL,
  team_id     VARCHAR(36)   NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id     BIGINT,
  first_name  VARCHAR(100)  NOT NULL DEFAULT '',
  last_name   VARCHAR(100)  NOT NULL DEFAULT '',
  email       VARCHAR(255)  NOT NULL DEFAULT '',
  affiliation VARCHAR(255)  NOT NULL DEFAULT '',
  is_owner    BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members (user_id);

-- ─────────────────────────────────────────────────────────────────
-- activity_log  (migration 008 + 009)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id           VARCHAR(36)    NOT NULL,
  user_id      BIGINT         NOT NULL REFERENCES users (userid) ON DELETE CASCADE,
  type         VARCHAR(50)    NOT NULL,
  title        VARCHAR(1000)  NOT NULL,
  actor        VARCHAR(255),
  project_name VARCHAR(500),
  created_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log (user_id);

-- ─────────────────────────────────────────────────────────────────
-- team_projects + team_project_roles  (migration 005 + 007 + 012)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_projects (
  id                     VARCHAR(36)   NOT NULL,
  team_id                VARCHAR(36)   NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  name                   VARCHAR(500)  NOT NULL DEFAULT '',
  description            TEXT,
  type                   VARCHAR(20)   NOT NULL DEFAULT 'private',
  status                 VARCHAR(20)   NOT NULL DEFAULT 'draft',
  deadline               TIMESTAMP,
  expected_collaborators INT,
  project_code           VARCHAR(50),
  documents              JSONB,
  attachments            JSONB         NOT NULL DEFAULT '[]',
  support_staff          JSONB,
  completed_step         SMALLINT      NOT NULL DEFAULT 1,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_team_projects_team_id ON team_projects (team_id);

CREATE OR REPLACE TRIGGER trg_team_projects_updated_at
  BEFORE UPDATE ON team_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS team_project_roles (
  id          VARCHAR(36)   NOT NULL,
  project_id  VARCHAR(36)   NOT NULL REFERENCES team_projects (id) ON DELETE CASCADE,
  user_id     BIGINT        NOT NULL REFERENCES users (userid),
  role        VARCHAR(20)   NOT NULL DEFAULT 'contributor',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_team_project_roles_project_id ON team_project_roles (project_id);
CREATE INDEX IF NOT EXISTS idx_team_project_roles_user_id    ON team_project_roles (user_id);

-- ─────────────────────────────────────────────────────────────────
-- team_project_collaborators  (migration 006)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_project_collaborators (
  id          VARCHAR(36)   NOT NULL,
  project_id  VARCHAR(36)   NOT NULL REFERENCES team_projects (id) ON DELETE CASCADE,
  user_id     BIGINT,
  first_name  VARCHAR(255)  NOT NULL DEFAULT '',
  last_name   VARCHAR(255)  NOT NULL DEFAULT '',
  email       VARCHAR(255)  NOT NULL DEFAULT '',
  affiliation VARCHAR(255)  NOT NULL DEFAULT '',
  role        VARCHAR(20)   NOT NULL DEFAULT 'contributor',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_tpc_user FOREIGN KEY (user_id) REFERENCES users (userid) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────────
-- team_project_submissions  (migration 011)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_project_submissions (
  id              VARCHAR(36)   NOT NULL,
  project_id      VARCHAR(36)   NOT NULL REFERENCES team_projects (id) ON DELETE CASCADE,
  collaborator_id VARCHAR(36)   NOT NULL REFERENCES team_project_collaborators (id) ON DELETE CASCADE,
  document_index  INT           NOT NULL,
  file_name       VARCHAR(500)  NOT NULL,
  file_size       BIGINT        NOT NULL,
  file_path       VARCHAR(1000) NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'submitted',
  feedback        TEXT,
  submitted_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE (project_id, collaborator_id, document_index)
);

CREATE OR REPLACE TRIGGER trg_team_project_submissions_updated_at
  BEFORE UPDATE ON team_project_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────
-- otp_store + reset_tokens  (auth security)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_store (
  email      VARCHAR(255) NOT NULL,
  otp        INT          NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash VARCHAR(64)  NOT NULL,
  email      VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  used       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash)
);

-- Holds signups that have not yet confirmed their email. The real users row is
-- created only once the OTP is verified, so an unverified account never exists.
CREATE TABLE IF NOT EXISTS pending_registrations (
  email        VARCHAR(255) NOT NULL,
  firstname    VARCHAR(255),
  lastname     VARCHAR(255),
  password     VARCHAR(255) NOT NULL,
  designation  VARCHAR(255),
  organization VARCHAR(255),
  otp          INT          NOT NULL,
  expires_at   TIMESTAMP    NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (email)
);

-- ─────────────────────────────────────────────────────────────────
-- Stripe integration (usage-based subscriptions)
-- One Stripe Customer per user; usage billing lives in stripe_subscriptions.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime_type VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_filename VARCHAR(500);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id                     SERIAL        PRIMARY KEY,
  userid                 BIGINT        NOT NULL REFERENCES users (userid) ON DELETE CASCADE,
  stripe_customer_id     VARCHAR(255)  NOT NULL,
  stripe_subscription_id VARCHAR(255)  NOT NULL UNIQUE,
  type                   VARCHAR(20)   NOT NULL DEFAULT 'solo',
  projects               INT           NOT NULL DEFAULT 0,
  collaborators          INT           NOT NULL DEFAULT 0,
  documents              INT           NOT NULL DEFAULT 0,
  days                   INT           NOT NULL DEFAULT 0,
  amount                 NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency               VARCHAR(10)   NOT NULL DEFAULT 'usd',
  status                 VARCHAR(30)   NOT NULL DEFAULT 'incomplete',
  current_period_end     TIMESTAMP,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_userid ON stripe_subscriptions (userid);

CREATE OR REPLACE TRIGGER trg_stripe_subscriptions_updated_at
  BEFORE UPDATE ON stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
