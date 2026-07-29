-- Adds document count to usage-based subscription records.

ALTER TABLE stripe_subscriptions
  ADD COLUMN IF NOT EXISTS documents INT NOT NULL DEFAULT 0;
