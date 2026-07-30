USE docsndocs;

ALTER TABLE team_projects ADD COLUMN attachments JSON NULL AFTER documents;
