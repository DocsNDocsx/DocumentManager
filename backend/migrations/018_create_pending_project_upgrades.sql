-- Retains the last paid project configuration while an active-project edit is awaiting payment.
CREATE TABLE IF NOT EXISTS pending_project_upgrades (
  project_id VARCHAR(255) PRIMARY KEY,
  project_type VARCHAR(20) NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
