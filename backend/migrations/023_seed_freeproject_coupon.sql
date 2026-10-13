-- Adds the initial single-use free-project coupon without changing existing rules or usage.
USE docsndocs;

INSERT IGNORE INTO coupons (
  id, code, label, benefit_type, max_redemptions, max_per_user
) VALUES (
  '8e9fc541-0ad6-4be1-9c8b-71824d9ac803',
  'FREEPROJECT', 'One free project', 'free_activation', 1, 1
);
