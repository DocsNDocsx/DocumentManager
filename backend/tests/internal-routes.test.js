jest.mock('../utils/deadlineReminder', () => ({
  sendDeadlineReminders: jest.fn(),
}));
jest.mock('../utils/staleProjectCleanup', () => ({
  cleanupStaleProjects: jest.fn(),
}));
jest.mock('../utils/staleProjectReminder', () => ({
  sendStaleProjectReminders: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');
const { cleanupStaleProjects } = require('../utils/staleProjectCleanup');
const { sendStaleProjectReminders } = require('../utils/staleProjectReminder');
const internalRoutes = require('../routes/internalroutes');
const { isScheduledCleanupTime } = require('../routes/internalroutes');

describe('internal cron routes', () => {
  const app = express();
  app.use('/api', internalRoutes);

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    sendDeadlineReminders.mockReset();
    cleanupStaleProjects.mockReset();
    sendStaleProjectReminders.mockReset();
  });

  it('runs deadline reminders for an authenticated Vercel GET request', async () => {
    sendDeadlineReminders.mockResolvedValue(4);
    sendStaleProjectReminders.mockResolvedValue({ sent: 2, failed: 0 });

    const response = await request(app)
      .get('/api/internal/deadline-reminders')
      .set('Authorization', 'Bearer test-cron-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      remindersSent: 4,
      staleReminders: { sent: 2, failed: 0 },
    });
    expect(sendDeadlineReminders).toHaveBeenCalledTimes(1);
    expect(cleanupStaleProjects).not.toHaveBeenCalled();
    expect(sendStaleProjectReminders).toHaveBeenCalledTimes(1);
  });

  it('rejects an unauthenticated GET request', async () => {
    const response = await request(app).get('/api/internal/deadline-reminders');

    expect(response.status).toBe(401);
    expect(sendDeadlineReminders).not.toHaveBeenCalled();
    expect(cleanupStaleProjects).not.toHaveBeenCalled();
    expect(sendStaleProjectReminders).not.toHaveBeenCalled();
  });

  it('recognizes the 11:30 PM Eastern cleanup window across daylight saving time', () => {
    expect(isScheduledCleanupTime(new Date('2026-08-20T03:30:00Z'))).toBe(true);
    expect(isScheduledCleanupTime(new Date('2026-12-20T04:30:00Z'))).toBe(true);
    expect(isScheduledCleanupTime(new Date('2026-08-20T04:30:00Z'))).toBe(false);
  });
});
