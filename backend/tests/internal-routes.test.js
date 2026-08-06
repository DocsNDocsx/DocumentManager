jest.mock('../utils/deadlineReminder', () => ({
  sendDeadlineReminders: jest.fn(),
}));
jest.mock('../utils/staleProjectCleanup', () => ({
  cleanupStaleProjects: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');
const { cleanupStaleProjects } = require('../utils/staleProjectCleanup');
const internalRoutes = require('../routes/internalroutes');

describe('internal cron routes', () => {
  const app = express();
  app.use('/api', internalRoutes);

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    sendDeadlineReminders.mockReset();
    cleanupStaleProjects.mockReset();
  });

  it('runs deadline reminders for an authenticated Vercel GET request', async () => {
    sendDeadlineReminders.mockResolvedValue(4);
    cleanupStaleProjects.mockResolvedValue({ cleaned: 2 });

    const response = await request(app)
      .get('/api/internal/deadline-reminders')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      remindersSent: 4,
      staleCleanup: { cleaned: 2 },
    });
    expect(sendDeadlineReminders).toHaveBeenCalledTimes(1);
    expect(cleanupStaleProjects).toHaveBeenCalledTimes(1);
  });

  it('rejects an unauthenticated GET request', async () => {
    const response = await request(app).get('/api/internal/deadline-reminders');

    expect(response.status).toBe(401);
    expect(sendDeadlineReminders).not.toHaveBeenCalled();
    expect(cleanupStaleProjects).not.toHaveBeenCalled();
  });
});
