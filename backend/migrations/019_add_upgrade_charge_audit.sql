-- Records the last immediate upgrade invoice separately from the paid configuration baseline.
ALTER TABLE stripe_subscriptions
  ADD COLUMN IF NOT EXISTS last_charge_amount NUMERIC(10,2);

ALTER TABLE stripe_subscriptions
  ADD COLUMN IF NOT EXISTS last_invoice_id VARCHAR(255);
