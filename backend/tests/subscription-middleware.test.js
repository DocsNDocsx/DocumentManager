jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));

const pool = require('../utils/sql');
const requireActiveSubscription = require('../middleware/subscription');

function mockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('requireActiveSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without an authenticated email', async () => {
    const res = mockResponse();
    const next = jest.fn();

    await requireActiveSubscription({ user: {} }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the email does not resolve to a user', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await requireActiveSubscription({ user: { email: 'missing@example.com' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unauthorized' });
  });

  it('allows users marked subscribed on the users table', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[{ issubscribed: 'true' }]]);
    const res = mockResponse();
    const next = jest.fn();

    await requireActiveSubscription({ user: { email: 'paid@example.com' } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows active Stripe subscriptions', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[{ issubscribed: 'false' }]])
      .mockResolvedValueOnce([[{ id: 'sub-row' }]]);
    const res = mockResponse();
    const next = jest.fn();

    await requireActiveSubscription({ user: { email: 'stripe@example.com' } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 402 when no active subscription exists', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[{ issubscribed: 'false' }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await requireActiveSubscription({ user: { email: 'free@example.com' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Please subscribe before activating a project.',
    });
  });

  it('returns 500 when the subscription lookup fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = mockResponse();

    await requireActiveSubscription({ user: { email: 'error@example.com' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error' });
  });
});
