function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function loadStripeController({ stripe = {}, amountCents = 972, productId = 'prod_test' } = {}) {
  jest.resetModules();

  jest.doMock('../utils/sql', () => ({
    query: jest.fn(),
  }));
  jest.doMock('../utils/stripe', () => ({
    stripe,
    computeMonthlyAmountCents: jest.fn(() => amountCents),
    getVoucher: jest.fn(code => (
      code === 'WELCOME10' ? { code: 'WELCOME10', percentOff: 10, label: 'Welcome voucher' } : null
    )),
    normalizeVoucherCode: jest.fn(code => String(code || '').trim().toUpperCase()),
    getProductId: jest.fn(async () => productId),
  }));
  jest.doMock('../utils/emailservice', () => ({
    sendEmail: jest.fn(async () => undefined),
  }));

  return {
    controller: require('../controllers/stripecontroller'),
    pool: require('../utils/sql'),
    stripeUtils: require('../utils/stripe'),
    emailService: require('../utils/emailservice'),
  };
}

describe('stripecontroller', () => {
  afterEach(() => {
    jest.dontMock('../utils/sql');
    jest.dontMock('../utils/stripe');
    jest.dontMock('../utils/emailservice');
  });

  describe('createSetupIntent', () => {
    it('returns 503 when Stripe is not configured', async () => {
      const { controller } = loadStripeController({ stripe: null });
      const res = mockResponse();

      await controller.createSetupIntent({ user: { email: 'paid@example.com' } }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Payments are not configured',
      });
    });

    it('returns 401 when the token does not resolve to a user', async () => {
      const { controller } = loadStripeController({ stripe: {} });
      const res = mockResponse();

      await controller.createSetupIntent({ user: {} }, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unauthorized' });
    });

    it('creates a Stripe customer and setup intent when the user has no customer id', async () => {
      const stripe = {
        customers: {
          create: jest.fn(async () => ({ id: 'cus_new' })),
        },
        setupIntents: {
          create: jest.fn(async () => ({ client_secret: 'seti_secret' })),
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query
        .mockResolvedValueOnce([[{
          userid: 123,
          email: 'new@example.com',
          firstname: 'New',
          lastname: 'User',
          stripe_customer_id: null,
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = mockResponse();

      await controller.createSetupIntent({ user: { email: 'new@example.com' }, body: {} }, res);

      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        metadata: { userid: '123' },
      });
      expect(stripe.setupIntents.create).toHaveBeenCalledWith({
        customer: 'cus_new',
        payment_method_types: ['card'],
        usage: 'off_session',
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        clientSecret: 'seti_secret',
        customerId: 'cus_new',
      });
    });

    it('reuses an existing Stripe customer when it is still usable', async () => {
      const stripe = {
        customers: {
          retrieve: jest.fn(async () => ({ id: 'cus_existing', deleted: false })),
        },
        setupIntents: {
          create: jest.fn(async () => ({ client_secret: 'seti_existing' })),
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        firstname: 'Paid',
        lastname: 'User',
        stripe_customer_id: 'cus_existing',
      }]]);
      const res = mockResponse();

      await controller.createSetupIntent({ user: { email: 'paid@example.com' }, body: {} }, res);

      expect(stripe.customers.retrieve).toHaveBeenCalledWith('cus_existing');
      expect(stripe.setupIntents.create).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_existing',
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        customerId: 'cus_existing',
      }));
    });
  });

  describe('createSubscription', () => {
    it('requires a configured payment profile', async () => {
      const { controller, pool } = loadStripeController({ stripe: {} });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'free@example.com',
        stripe_customer_id: null,
      }]]);
      const res = mockResponse();

      await controller.createSubscription({ user: { email: 'free@example.com' }, body: {} }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No payment profile found. Please add a card first.',
      });
    });

    it('requires a payment method id', async () => {
      const { controller, pool } = loadStripeController({ stripe: {} });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }]]);
      const res = mockResponse();

      await controller.createSubscription({ user: { email: 'paid@example.com' }, body: {} }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'paymentMethodId is required',
      });
    });

    it('creates a subscription with server-side usage pricing', async () => {
      const stripe = {
        customers: {
          update: jest.fn(async () => ({})),
        },
        subscriptions: {
          create: jest.fn(async () => ({
            id: 'sub_123',
            status: 'active',
            current_period_end: 1798761600,
            latest_invoice: {
              id: 'in_123',
              number: 'INV-123',
              amount_paid: 972,
              currency: 'usd',
              hosted_invoice_url: 'https://invoice.stripe.test/in_123',
              created: 1798761500,
              status_transitions: { paid_at: 1798761600 },
            },
          })),
        },
      };
      const { controller, pool, stripeUtils, emailService } = loadStripeController({ stripe, amountCents: 972 });
      pool.query
        .mockResolvedValueOnce([[{
          userid: 123,
          email: 'paid@example.com',
          timezone: 'America/New_York',
          stripe_customer_id: 'cus_123',
        }]])
        .mockResolvedValueOnce([[
          { id: 'project-1', type: 'public', deadline: '2026-09-30', collaborators: '[]', documents: '[]', assignments: '{}' },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = mockResponse();

      await controller.createSubscription({
        user: { email: 'paid@example.com' },
        body: {
          paymentMethodId: 'pm_123',
          type: 'solo',
          projects: 1,
          collaborators: 2,
          documents: 3,
          days: 20,
          projectId: 'project-1',
          voucherCode: 'welcome10',
          billingAddress: {
            line1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        },
      }, res);

      expect(stripeUtils.computeMonthlyAmountCents).toHaveBeenCalledWith({
        projects: 1,
        collaborators: 2,
        documents: 3,
        days: 20,
        voucherCode: 'WELCOME10',
      });
      expect(stripe.customers.update).toHaveBeenCalledWith('cus_123', {
        invoice_settings: { default_payment_method: 'pm_123' },
        address: {
          line1: '123 Main St',
          line2: undefined,
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'US',
        },
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET address_line1 = ?'),
        ['123 Main St', '', 'New York', 'NY', '10001', 'US', 123],
      );
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          default_payment_method: 'pm_123',
          automatic_tax: { enabled: false },
          items: [expect.objectContaining({
            price_data: expect.objectContaining({
              currency: 'usd',
              product: 'prod_test',
              unit_amount: 972,
              recurring: { interval: 'month' },
            }),
          })],
        }),
        { idempotencyKey: 'sub_123_project-1_pm_123' },
      );
      expect(stripe.subscriptions.create.mock.calls[0][0].metadata).toEqual(expect.objectContaining({
        projectId: 'project-1',
        voucherCode: 'WELCOME10',
      }));
      expect(pool.query).toHaveBeenLastCalledWith(
        "UPDATE users SET issubscribed = 'true' WHERE userid = ?",
        [123],
      );
      expect(pool.query.mock.calls[3][0]).toContain('ON DUPLICATE KEY UPDATE');
      expect(pool.query.mock.calls[3][1]).toEqual(expect.arrayContaining(['project-1']));
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT id FROM payment_history WHERE invoice_no = ? AND userid = ?',
        ['INV-123', 123],
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_history'),
        expect.arrayContaining([123, 'INV-123', 'Usage subscription', 9.72, 'USD', 'solo']),
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        subscriptionId: 'sub_123',
        status: 'active',
        voucherCode: 'WELCOME10',
      }));
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'paid@example.com',
        'DocsNDocs: Payment receipt',
        expect.stringContaining('Invoice:</strong> INV-123'),
      );
      expect(emailService.sendEmail.mock.calls[0][2]).toContain('USD 9.72');
      expect(emailService.sendEmail.mock.calls[0][2]).toContain('https://invoice.stripe.test/in_123');
    });

    it('uses saved solo-private assignments instead of client-supplied collaborator and document counts', async () => {
      const stripe = {
        customers: { update: jest.fn(async () => ({})) },
        subscriptions: {
          create: jest.fn(async () => ({
            id: 'sub_private',
            status: 'active',
            current_period_end: null,
            latest_invoice: null,
          })),
        },
      };
      const { controller, pool, stripeUtils } = loadStripeController({ stripe, amountCents: 214 });
      const deadline = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      pool.query
        .mockResolvedValueOnce([[
          { userid: 123, email: 'paid@example.com', timezone: 'UTC', stripe_customer_id: 'cus_123' },
        ]])
        .mockResolvedValueOnce([[
          {
            id: 'private-1',
            type: 'private',
            deadline,
            collaborators: JSON.stringify([{ status: 'active' }, { status: 'active' }, { status: 'inactive' }]),
            documents: JSON.stringify([{ name: 'A' }, { name: 'B' }, { name: 'Old', status: 'inactive' }]),
            assignments: JSON.stringify({ 0: [0, 0], 1: [1, 2], 2: [0] }),
          },
        ]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = mockResponse();

      await controller.createSubscription({
        user: { email: 'paid@example.com' },
        body: {
          paymentMethodId: 'pm_private',
          type: 'solo',
          projectId: 'private-1',
          collaborators: 99,
          documents: 99,
          assignmentCount: 99,
          days: 99,
        },
      }, res);

      expect(stripeUtils.computeMonthlyAmountCents).toHaveBeenCalledWith({
        projects: 1,
        collaborators: 2,
        documents: 2,
        assignmentCount: 2,
        days: 3,
        voucherCode: '',
      });
      expect(stripe.subscriptions.create.mock.calls[0][0].metadata).toEqual(expect.objectContaining({
        collaborators: '2',
        documents: '2',
        assignmentCount: '2',
        days: '3',
      }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, subscriptionId: 'sub_private' }));
    });

    it('rejects solo-private billing when the project is not owned by the signed-in user', async () => {
      const stripe = {
        customers: { update: jest.fn(async () => ({})) },
        subscriptions: { create: jest.fn() },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query
        .mockResolvedValueOnce([[
          { userid: 123, email: 'paid@example.com', timezone: 'UTC', stripe_customer_id: 'cus_123' },
        ]])
        .mockResolvedValueOnce([[]]);
      const res = mockResponse();

      await controller.createSubscription({
        user: { email: 'paid@example.com' },
        body: { paymentMethodId: 'pm_private', type: 'solo', projectId: 'not-owned' },
      }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    });

    it('rejects invalid voucher codes before charging the card', async () => {
      const stripe = {
        customers: {
          update: jest.fn(async () => ({})),
        },
        subscriptions: {
          create: jest.fn(async () => ({ id: 'sub_123', status: 'active' })),
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }]]);
      const res = mockResponse();

      await controller.createSubscription({
        user: { email: 'paid@example.com' },
        body: {
          paymentMethodId: 'pm_123',
          voucherCode: 'bad-code',
        },
      }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid voucher code' });
      expect(stripe.customers.update).not.toHaveBeenCalled();
      expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    });

    it('uses default usage values and ignores client-side estimates', async () => {
      const stripe = {
        customers: {
          update: jest.fn(async () => ({})),
        },
        subscriptions: {
          create: jest.fn(async () => ({
            id: 'sub_defaults',
            status: 'active',
            current_period_end: null,
          })),
        },
      };
      const { controller, pool, stripeUtils } = loadStripeController({ stripe, amountCents: 194 });
      pool.query
        .mockResolvedValueOnce([[{
          userid: 123,
          email: 'paid@example.com',
          stripe_customer_id: 'cus_123',
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);
      const res = mockResponse();

      await controller.createSubscription({
        user: { email: 'paid@example.com' },
        body: {
          paymentMethodId: 'pm_defaults',
          monthlyEstimate: 999999,
        },
      }, res);

      expect(stripeUtils.computeMonthlyAmountCents).toHaveBeenCalledWith({
        projects: 1,
        collaborators: 1,
        documents: 1,
        days: 20,
        voucherCode: '',
      });
      expect(stripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 194 }),
          })],
          metadata: expect.objectContaining({
            projectId: '',
            type: 'solo',
            projects: '1',
            collaborators: '1',
            documents: '1',
            days: '20',
          }),
        }),
        { idempotencyKey: 'sub_123_general_pm_defaults' },
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        subscriptionId: 'sub_defaults',
        invoiceId: null,
        status: 'active',
        nextPaymentAt: null,
        voucherCode: null,
      });
    });
  });

  describe('getPaymentConfirmation', () => {
    it('returns authoritative invoice and project details for the payment owner', async () => {
      const stripe = {
        invoices: {
          retrieve: jest.fn(async () => ({
            id: 'in_123',
            number: 'INV-123',
            customer: 'cus_123',
            subscription: 'sub_123',
            paid: true,
            status: 'paid',
            amount_paid: 972,
            currency: 'usd',
            created: 1798761500,
            status_transitions: { paid_at: 1798761600 },
          })),
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query
        .mockResolvedValueOnce([[{
          userid: 123,
          email: 'paid@example.com',
          firstname: 'Paid',
          lastname: 'User',
          stripe_customer_id: 'cus_123',
        }]])
        .mockResolvedValueOnce([[{ timezone: 'America/Chicago' }]])
        .mockResolvedValueOnce([[{
          project_id: 'project-1',
          type: 'solo',
          projects: 1,
          collaborators: 4,
          documents: 3,
          days: 20,
        }]])
        .mockResolvedValueOnce([[{
          id: 'project-1',
          type: 'public',
          project_code: 'PRJ-TEST-1234',
          deadline: '2026-08-29',
        }]]);
      const res = mockResponse();

      await controller.getPaymentConfirmation({
        user: { email: 'paid@example.com' },
        params: { invoiceId: 'in_123' },
      }, res);

      expect(stripe.invoices.retrieve).toHaveBeenCalledWith('in_123');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        confirmation: expect.objectContaining({
          invoiceId: 'in_123',
          invoiceNumber: 'INV-123',
          projectId: 'project-1',
          projectCode: 'PRJ-TEST-1234',
          projectType: 'solo',
          visibility: 'public',
          projects: 1,
          collaborators: 4,
          documents: 3,
          days: 20,
          amountCharged: '9.72',
          currency: 'USD',
          customerName: 'Paid User',
          timezone: 'America/Chicago',
        }),
      });
    });

    it('does not expose a payment belonging to another Stripe customer', async () => {
      const stripe = {
        invoices: {
          retrieve: jest.fn(async () => ({
            id: 'in_other',
            customer: 'cus_other',
            paid: true,
            status: 'paid',
          })),
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }]]);
      const res = mockResponse();

      await controller.getPaymentConfirmation({
        user: { email: 'paid@example.com' },
        params: { invoiceId: 'in_other' },
      }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'This payment does not belong to your account',
      });
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateTax', () => {
    it('estimates tax using Stripe Tax and the billing ZIP/address', async () => {
      const stripe = {
        tax: {
          calculations: {
            create: jest.fn(async () => ({
              id: 'taxcalc_123',
              tax_amount_exclusive: 19,
              amount_total: 233,
            })),
          },
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }]]);
      const res = mockResponse();

      await controller.estimateTax({
        user: { email: 'paid@example.com' },
        body: {
          amountCents: 214,
          billingAddress: {
            line1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        },
      }, res);

      expect(stripe.tax.calculations.create).toHaveBeenCalledWith({
        currency: 'usd',
        customer_details: {
          address: {
            line1: '123 Main St',
            line2: undefined,
            city: 'New York',
            state: 'NY',
            postal_code: '10001',
            country: 'US',
          },
          address_source: 'billing',
        },
        line_items: [{
          amount: 214,
          product: 'prod_test',
          reference: 'docsndocs_usage',
          tax_behavior: 'exclusive',
        }],
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        calculationId: 'taxcalc_123',
        taxAmountCents: 19,
        totalAmountCents: 233,
        taxAmount: 0.19,
        totalAmount: 2.33,
      });
    });

    it('rejects invalid tax estimate inputs before calling Stripe', async () => {
      const stripe = {
        tax: {
          calculations: {
            create: jest.fn(),
          },
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([[{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }]]);
      const res = mockResponse();

      await controller.estimateTax({
        user: { email: 'paid@example.com' },
        body: {
          amountCents: 0,
          billingAddress: { postalCode: '', country: 'US' },
        },
      }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'amountCents must be greater than zero' });
      expect(stripe.tax.calculations.create).not.toHaveBeenCalled();
    });

    it('falls back to zero tax when Stripe Tax is unavailable', async () => {
      const stripe = {
        tax: {
          calculations: {
            create: jest.fn(async () => {
              throw new Error('You must have a valid head office address to enable automatic tax calculation in test mode.');
            }),
          },
        },
      };
      const { controller, pool } = loadStripeController({ stripe });
      pool.query.mockResolvedValueOnce([ [{
        userid: 123,
        email: 'paid@example.com',
        stripe_customer_id: 'cus_123',
      }] ]);
      const res = mockResponse();

      await controller.estimateTax({
        user: { email: 'paid@example.com' },
        body: {
          amountCents: 214,
          billingAddress: {
            line1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
        },
      }, res);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        calculationId: null,
        taxAmountCents: 0,
        totalAmountCents: 214,
        taxAmount: 0,
        totalAmount: 2.14,
        taxEstimateUnavailable: true,
      });
    });
  });
});
