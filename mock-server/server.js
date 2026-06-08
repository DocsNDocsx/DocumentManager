// Minimal LOCAL mock backend for testing the Stripe payment page.
// Implements the two endpoints the Angular app expects:
//   POST /api/stripe/setup-intent
//   POST /api/stripe/subscription
//
// This is for local testing ONLY. Your real backend should implement these
// properly (auth, persistence, idempotency, webhooks, server-side pricing).
//
// Run:
//   cd mock-server
//   npm install
//   $env:STRIPE_SECRET_KEY = "sk_test_xxx"   # PowerShell (use your TEST secret key)
//   npm start

import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!SECRET_KEY) {
  console.error('\n[mock-server] STRIPE_SECRET_KEY is not set. Set your Stripe TEST secret key, e.g.:');
  console.error('  PowerShell:  $env:STRIPE_SECRET_KEY = "sk_test_xxx"; npm start\n');
  process.exit(1);
}
if (!SECRET_KEY.startsWith('sk_test_')) {
  console.warn('[mock-server] WARNING: key does not look like a TEST secret key (sk_test_...). Refusing to start.');
  process.exit(1);
}

const stripe = new Stripe(SECRET_KEY);
const PORT = 3000;

const app = express();
app.use(cors()); // allow the Angular dev server (localhost:4200) to call us
app.use(express.json());

// Cache a single mock product so we don't create a new one per request.
let mockProductId = null;
async function getMockProduct() {
  if (!mockProductId) {
    const product = await stripe.products.create({ name: 'docsndocs usage (mock)' });
    mockProductId = product.id;
  }
  return mockProductId;
}

// 1) Create (or reuse) a Customer and a SetupIntent to securely save the card.
app.post('/api/stripe/setup-intent', async (req, res) => {
  try {
    const { email, name } = req.body ?? {};

    // Reuse an existing customer for this email if present; otherwise create one.
    let customer;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customer = existing.data[0];
    }
    if (!customer) {
      customer = await stripe.customers.create({ email, name });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      usage: 'off_session', // card will be charged later for the subscription
    });

    res.json({ success: true, clientSecret: setupIntent.client_secret, customerId: customer.id });
  } catch (err) {
    console.error('[setup-intent]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2) Attach the saved card as default and create the recurring Subscription.
app.post('/api/stripe/subscription', async (req, res) => {
  try {
    const { customerId, paymentMethodId, type, projects, collaborators, days, monthlyEstimate } = req.body ?? {};

    // NOTE: a real backend MUST compute the price server-side. Here we just trust
    // the client's estimate for demonstration purposes.
    const unitAmount = Math.max(0, Math.round(Number(monthlyEstimate) * 100));

    // Make the saved card the customer's default for invoices.
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const product = await getMockProduct();

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      default_payment_method: paymentMethodId,
      items: [
        {
          price_data: {
            currency: 'usd',
            product,
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
          },
        },
      ],
      metadata: {
        type: String(type ?? ''),
        projects: String(projects ?? ''),
        collaborators: String(collaborators ?? ''),
        days: String(days ?? ''),
      },
      expand: ['latest_invoice.payment_intent'],
    });

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextPaymentAt: periodEnd,
    });
  } catch (err) {
    console.error('[subscription]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[mock-server] Stripe mock backend listening on http://localhost:${PORT}`);
  console.log('[mock-server] Endpoints: POST /api/stripe/setup-intent, POST /api/stripe/subscription');
});
