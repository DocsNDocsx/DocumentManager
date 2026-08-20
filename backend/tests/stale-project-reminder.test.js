jest.mock('../utils/sql', () => ({ query: jest.fn() }));
jest.mock('../utils/emailservice', () => ({ sendEmail: jest.fn() }));

const pool = require('../utils/sql');
const { sendEmail } = require('../utils/emailservice');
const { sendStaleProjectReminders, REMINDER_DAYS } = require('../utils/staleProjectReminder');

describe('sendStaleProjectReminders', () => {
  beforeEach(() => {
    pool.query.mockReset();
    sendEmail.mockReset().mockResolvedValue({});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  it('emails solo and team owners on the fourteenth day', async () => {
    const day14 = new Date();
    day14.setUTCDate(day14.getUTCDate() - 14);
    pool.query
      .mockResolvedValueOnce([[
        { id: 'solo-1', name: 'Solo Study', updated_at: day14, inactive_days: 14, project_kind: 'solo', email: 'solo@example.com', firstname: 'Solo' },
      ]])
      .mockResolvedValueOnce([[
        { id: 'team-1', name: 'Team Study', updated_at: day14, inactive_days: 14, project_kind: 'team', email: 'team@example.com', firstname: 'Team' },
      ]]);

    await expect(sendStaleProjectReminders()).resolves.toEqual({ sent: 2, failed: 0 });
    expect(pool.query.mock.calls[0][0]).toContain("p.status <> 'active'");
    expect(pool.query.mock.calls[0][1]).toEqual(REMINDER_DAYS);
    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      'solo@example.com',
      expect.stringContaining('Final deletion reminder'),
      expect.stringContaining('has not been updated for 14 days'),
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      'team@example.com',
      expect.stringContaining('Final deletion reminder'),
      expect.stringContaining('scheduled for permanent deletion tomorrow'),
    );
  });

  it('continues sending other reminders when one email fails', async () => {
    const day14 = new Date();
    day14.setUTCDate(day14.getUTCDate() - 14);
    pool.query
      .mockResolvedValueOnce([[
        { id: 'one', name: 'One', updated_at: day14, inactive_days: 14, email: 'one@example.com' },
        { id: 'two', name: 'Two', updated_at: day14, inactive_days: 14, email: 'two@example.com' },
      ]])
      .mockResolvedValueOnce([[]]);
    sendEmail.mockRejectedValueOnce(new Error('delivery failed')).mockResolvedValueOnce({});

    await expect(sendStaleProjectReminders()).resolves.toEqual({ sent: 1, failed: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
