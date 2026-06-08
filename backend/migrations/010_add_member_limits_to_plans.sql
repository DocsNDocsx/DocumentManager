ALTER TABLE plans
  ADD COLUMN min_members INT NOT NULL DEFAULT 0,
  ADD COLUMN max_members INT NOT NULL DEFAULT 0;

UPDATE plans SET min_members = 1,  max_members = 0   WHERE slug = 'free';
UPDATE plans SET min_members = 1,  max_members = 5   WHERE slug = 'bronze';
UPDATE plans SET min_members = 6,  max_members = 15  WHERE slug = 'silver';
UPDATE plans SET min_members = 16, max_members = 100 WHERE slug = 'gold';
