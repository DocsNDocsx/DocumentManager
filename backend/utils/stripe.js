const Stripe = require('stripe');

// Initialized lazily-safe: if the secret key is absent (e.g. env not set on a
// preview deploy) `stripe` is null and the controllers respond 503 rather than
// crashing the whole API.
const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;

// ─────────────────────────────────────────────────────────────────
// Server-side pricing — the source of truth. The client sends a
// monthlyEstimate but it is informational only and never trusted.
// Mirrors src/app/pages/pricing-plan/pricing-plan.ts (RATE). Sales tax is
// calculated by Stripe Tax from the customer's billing address.
// ─────────────────────────────────────────────────────────────────
const RATE = 0.09; // $ per project · collaborator · day
const STRIPE_CARD_PERCENT_FEE = 0.029;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;
const VOUCHERS = {
  WELCOME10: { percentOff: 10, label: 'Welcome voucher' },
  LAUNCH25: { percentOff: 25, label: 'Launch voucher' },
};

function toUsageNumber(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function normalizeVoucherCode(code) {
  return String(code || '').trim().toUpperCase();
}

function getVoucher(code) {
  const normalized = normalizeVoucherCode(code);
  if (!normalized) return null;
  const voucher = VOUCHERS[normalized];
  return voucher ? { code: normalized, ...voucher } : null;
}

function computeDiscountCents(amountCents, voucherCode) {
  const voucher = getVoucher(voucherCode);
  if (!voucher) return 0;
  return Math.round(amountCents * (voucher.percentOff / 100));
}

function computeStripeProcessingFeeCents(amountCents) {
  if (!Number.isFinite(Number(amountCents)) || Number(amountCents) <= 0) return 0;
  return Math.round(Number(amountCents) * STRIPE_CARD_PERCENT_FEE) + STRIPE_CARD_FIXED_FEE_CENTS;
}

/** Recurring monthly charge in cents, computed from usage. */
function computeMonthlyAmountCents({ projects, collaborators, documents, days, voucherCode }) {
  const base =
    toUsageNumber(projects) *
    toUsageNumber(collaborators) *
    toUsageNumber(documents) *
    RATE *
    toUsageNumber(days, 20);
  const amountCents = Math.max(0, Math.round(base * 100));
  const discountedAmountCents = Math.max(0, amountCents - computeDiscountCents(amountCents, voucherCode));
  return discountedAmountCents + computeStripeProcessingFeeCents(discountedAmountCents);
}

// A single Stripe Product backs every usage subscription (the variable price is
// passed inline via price_data). Set STRIPE_PRODUCT_ID in production so a new
// product is not created on a cold start; otherwise one is created and cached.
let cachedProductId = process.env.STRIPE_PRODUCT_ID || null;
async function getProductId() {
  if (cachedProductId) return cachedProductId;
  const product = await stripe.products.create({ name: 'docsndocs usage' });
  cachedProductId = product.id;
  return cachedProductId;
}

module.exports = {
  stripe,
  computeMonthlyAmountCents,
  computeDiscountCents,
  computeStripeProcessingFeeCents,
  getVoucher,
  normalizeVoucherCode,
  getProductId,
  RATE,
  STRIPE_CARD_PERCENT_FEE,
  STRIPE_CARD_FIXED_FEE_CENTS,
};
