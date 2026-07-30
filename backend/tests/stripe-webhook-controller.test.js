function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
}

function loadWebhookController({ stripe = {}, webhookSecret = 'whsec_test' } = {}) {
  jest.resetModules();

  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

  jest.doMock('../utils/sql', () => ({
    query: jest.fn(),
  }));
  jest.doMock('../utils/stripe', () => ({
    stripe,
  }));

  return {
    controller: require('../controllers/stripewebhookcontroller'),
    pool: require('../utils/sql'),
  };
}

function stripeWithEvent(event) {
  return {
    webhooks: {
      constructEvent: jest.fn(() => event),
    },
  };
}

describe('stripewebhookcontroller.handleWebhook', () => {
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  afterEach(() => {
    jest.dontMock('../utils/sql');
    jest.dontMock('../utils/stripe');
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
    jest.restoreAllMocks();
  });

  it('returns 503 when Stripe webhook config is missing', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { controller } = loadWebhookController({ stripe: null, webhookSecret: '' });
    const res = mockResponse();

    await controller.handleWebhook({ headers: {}, body: Buffer.from('{}') }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith('Webhook not configured');
  });

  it('returns 400 when Stripe signature verification fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const stripe = {
      webhooks: {
        constructEvent: jest.fn(() => {
          throw new Error('bad signature');
        }),
      },
    };
    const { controller } = loadWebhookController({ stripe });
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'bad_sig' },
      body: Buffer.from('{}'),
    }, res);

    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(Buffer.from('{}'), 'bad_sig', 'whsec_test');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Webhook Error: bad signature');
  });

  it('records successful invoice payment and marks subscription active', async () => {
    const invoice = {
      id: 'in_1',
      number: 'INV-1',
      subscription: 'sub_1',
      amount_paid: 972,
      currency: 'usd',
      status_transitions: { paid_at: 1798761600 },
      created: 1798761500,
    };
    const stripe = stripeWithEvent({
      type: 'invoice.payment_succeeded',
      data: { object: invoice },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    pool.query
      .mockResolvedValueOnce([[{ userid: 123, type: 'solo' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO payment_history'),
      [
        123,
        'INV-1',
        'Usage subscription',
        9.72,
        'USD',
        'paid',
        null,
        new Date(1798761600 * 1000).toISOString(),
        'solo',
      ],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE stripe_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?',
      ['active', 'sub_1'],
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('records failed invoice payment and marks subscription past_due', async () => {
    const invoice = {
      id: 'in_failed',
      subscription: 'sub_1',
      amount_due: 500,
      currency: 'usd',
      created: 1798761500,
      metadata: { userid: 'fallback-user' },
    };
    const stripe = stripeWithEvent({
      type: 'invoice.payment_failed',
      data: { object: invoice },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO payment_history'),
      expect.arrayContaining(['fallback-user', 'in_failed', 'failed']),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE stripe_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?',
      ['past_due', 'sub_1'],
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('updates subscription status and current period end', async () => {
    const stripe = stripeWithEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'trialing',
          current_period_end: 1798761600,
        },
      },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stripe_subscriptions'),
      ['trialing', new Date(1798761600 * 1000).toISOString(), 'sub_1'],
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('cancels a deleted subscription and flips user subscription flag when no active subscription remains', async () => {
    const stripe = stripeWithEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          status: 'canceled',
          current_period_end: null,
        },
      },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE stripe_subscriptions'),
      ['cancelled', null, 'sub_1'],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      "UPDATE users SET issubscribed = 'false' WHERE userid = ?",
      [123],
    );
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('acknowledges unhandled events without database writes', async () => {
    const stripe = stripeWithEvent({
      type: 'customer.created',
      data: { object: { id: 'cus_1' } },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  it('returns 500 when handler database work fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const stripe = stripeWithEvent({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'active', current_period_end: null } },
    });
    const { controller, pool } = loadWebhookController({ stripe });
    pool.query.mockRejectedValueOnce(new Error('db failed'));
    const res = mockResponse();

    await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig_ok' },
      body: Buffer.from('{}'),
    }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith('Webhook handler failed');
  });
});
