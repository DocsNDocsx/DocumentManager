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

  it('rejects users marked subscribed when this project has not been paid', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();
    const next = jest.fn();

    await requireActiveSubscription({ user: { email: 'paid@example.com' }, params: { id: 'project-2' } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('allows active Stripe subscriptions linked to the project being activated', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[{ id: 'sub-row' }]]);
    const res = mockResponse();
    const next = jest.fn();

    await requireActiveSubscription({ user: { email: 'stripe@example.com' }, params: { id: 'project-1' } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 402 when no active subscription exists', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: 123 }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await requireActiveSubscription({ user: { email: 'free@example.com' }, params: { id: 'project-1' } }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Please complete payment before activating this project.',
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
