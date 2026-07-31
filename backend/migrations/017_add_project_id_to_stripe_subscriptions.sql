-- Links each usage subscription to the project activation it paid for.

ALTER TABLE stripe_subscriptions
  ADD COLUMN IF NOT EXISTS project_id VARCHAR(255);
