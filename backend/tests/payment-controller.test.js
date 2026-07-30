jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));

const pool = require('../utils/sql');
const paymentController = require('../controllers/paymentcontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('paymentcontroller.getPaymentHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires userid', async () => {
    const res = mockResponse();

    await paymentController.getPaymentHistory({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('formats payment history and active subscription summary', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        invoice_no: 'INV-1',
        plan: 'Usage subscription',
        amount: '9.72',
        currency: 'usd',
        status: 'paid',
        payment_method: 'Visa ending 4242',
        paid_at: '2026-07-15T12:00:00.000Z',
      }]])
      .mockResolvedValueOnce([[{ total_spent: '19.44', total_payments: 2 }]])
      .mockResolvedValueOnce([[{
        type: 'team',
        amount: '9.72',
        status: 'active',
        current_period_end: '2026-08-15T12:00:00.000Z',
      }]]);
    const res = mockResponse();

    await paymentController.getPaymentHistory({ query: { userid: '123', type: 'team' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      summary: expect.objectContaining({
        totalSpent: '$19.44',
        totalPayments: 2,
        currentPlan: 'Team usage subscription',
        currentPlanSub: '$9.72 current usage total',
        nextPayment: 'Aug 15',
      }),
      payments: [{
        date: 'Jul 15, 2026',
        invoice: 'INV-1',
        plan: 'Usage subscription',
        amount: '$9.72',
        status: 'paid',
        method: 'Visa ending 4242',
      }],
    });
  });

  it('formats empty history without an active subscription', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total_spent: '0', total_payments: 0 }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await paymentController.getPaymentHistory({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      summary: expect.objectContaining({
        currentPlan: 'No active subscription',
        currentPlanSub: 'Subscribe to activate projects',
        nextPayment: '-',
        nextPaymentSub: 'No upcoming payment',
      }),
      payments: [],
    }));
  });

  it('returns 500 when SQL fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('db failed'));
    const res = mockResponse();

    await paymentController.getPaymentHistory({ query: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error' });
    console.error.mockRestore();
  });
});
