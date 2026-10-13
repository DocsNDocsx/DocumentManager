# Project activation coupons

Run the schema migration before deploying the updated backend. PostgreSQL deployments use backend/scripts/migrate.js (the existing build migration); MySQL uses backend/migrations/022_create_coupons.sql followed by backend/migrations/023_seed_freeproject_coupon.sql. If the coupon tables already exist, MySQL only needs migration 023 to seed FREEPROJECT. This change does not run a migration against a live database.

Coupons are managed directly in the database in this first implementation. There is no admin screen yet. Codes must be stored uppercase. WELCOME10 and LAUNCH25 are seeded as percentage discounts, each limited to one redemption per user.

Migration 023 seeds FREEPROJECT as a free activation coupon limited to one successful redemption total and one per user. PostgreSQL includes the same seed in postgres_schema.sql. Both seed statements preserve an existing coupon with that code, including its enabled status and redemption history; rerunning the migration never restores a consumed coupon. Coupon creation is now recorded in version-controlled migration source. Deployment build logs record execution of the PostgreSQL schema runner; no migration execution-history table is introduced here.

Example: a single-use free project coupon (PostgreSQL; replace the ID and code with your chosen values):

```sql
INSERT INTO coupons
  (id, code, label, benefit_type, max_redemptions, max_per_user,
   expires_at, max_collaborators, max_documents, max_days)
VALUES
  ('c42ed89b-871a-4587-80be-5ecf2c4ac412', 'FREEPROJECT2026',
   'One free project', 'free_activation', 1, 1,
   '2026-12-31 23:59:59', 10, 5, 30);
```

Optional eligible_user_id restricts the code to one user; project_type restricts it to solo or team projects. Null max_redemptions permits unlimited total redemptions while max_per_user still applies. Null usage limits impose no coupon-specific limit. The user must own the solo project or its team. Project configuration, document assignments and remaining days are read from the database, not checkout inputs. Limits apply to the initial activation configuration; subsequent changes follow the existing project upgrade flow.

POST /api/coupons/validate accepts {code, projectId, type} and returns the server quote without reserving or redeeming a slot. The billing page uses this endpoint. Free activation submits the same payload to POST /api/coupons/activate, which locks the coupon and project and commits activation and redemption together. It requires neither a card nor Stripe configuration. Repeating a successful free activation does not generate another project code or redemption.

Percentage discounts apply to the usage price before card fees and preserve the application's recurring discounted-price behavior. They are initial-activation coupons, not upgrade coupons. Checkout reserves a slot under a coupon row lock; reserved slots count toward limits but have no redeemed_at timestamp. The first paid invoice marks the redemption successful in a transaction. Signed Stripe webhooks also settle payments that complete later. A replay cannot consume the code twice. Explicit Stripe card/request failures before a subscription is linked release the slot; incomplete_expired subscriptions release their slot through the webhook. Failed invoices keep the slot reserved because the same invoice can subsequently succeed.

Unknown network outcomes deliberately keep the reservation. Retry uses the same redemption-based Stripe idempotency key or retrieves an already-linked subscription. Unlinked attempts older than 23 hours require reconciliation against Stripe before reuse, avoiding a duplicate checkout after Stripe's idempotency retention window. Do not manually release a reservation until Stripe confirms no payment can complete. Never change benefit or pricing rules on a code with outstanding payments; disable it and create a new code instead.

Inspect successful use with:

```sql
SELECT c.code, r.user_id, r.project_id, r.project_type, r.status,
       r.discount_cents, r.subscription_id, r.redeemed_at
FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id
ORDER BY r.created_at DESC;
```

Disable future use with UPDATE coupons SET enabled = FALSE WHERE code = 'FREEPROJECT2026'. This does not revoke an already activated project's entitlement.
