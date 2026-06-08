USE docsndocs;

ALTER TABLE activity_log
  ADD COLUMN project_name VARCHAR(500) NULL DEFAULT NULL AFTER actor;
