const express = require('express');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');
const { cleanupStaleProjects } = require('../utils/staleProjectCleanup');
const { sendStaleProjectReminders } = require('../utils/staleProjectReminder');
const router = express.Router();

function authorizeCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  return true;
}

function isScheduledCleanupTime(now = new Date()) {
  const timeZone = process.env.CLEANUP_TIME_ZONE || 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = type => Number(parts.find(part => part.type === type)?.value);
  return value('hour') === 23 && value('minute') >= 30;
}

// Called daily by Vercel Cron using GET. Vercel automatically sends:
//   Authorization: Bearer <CRON_SECRET>
// POST remains available for authenticated manual/internal invocations.
async function runDeadlineReminders(req, res) {
  if (!authorizeCron(req, res)) return;

  const [reminderResult, staleReminderResult] = await Promise.allSettled([
    sendDeadlineReminders(),
    sendStaleProjectReminders(),
  ]);

  if (reminderResult.status === 'rejected') {
    console.error('[cron] deadline-reminders failed:', reminderResult.reason?.message ?? reminderResult.reason);
  }
  if (staleReminderResult.status === 'rejected') {
    console.error('[cron] stale-project-reminders failed:', staleReminderResult.reason?.message ?? staleReminderResult.reason);
  }

  const success = reminderResult.status === 'fulfilled'
    && staleReminderResult.status === 'fulfilled';
  res.status(success ? 200 : 500).json({
    success,
    remindersSent: reminderResult.status === 'fulfilled' ? reminderResult.value : null,
    staleReminders: staleReminderResult.status === 'fulfilled' ? staleReminderResult.value : null,
  });
}

router.get('/internal/deadline-reminders', runDeadlineReminders);
router.post('/internal/deadline-reminders', runDeadlineReminders);

router.post('/internal/stale-project-cleanup', async (req, res) => {
  if (!authorizeCron(req, res)) return;

  try {
    const staleCleanup = await cleanupStaleProjects();
    res.json({ success: true, staleCleanup });
  } catch (err) {
    console.error('[cron] stale-project-cleanup failed:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/internal/stale-project-cleanup', async (req, res) => {
  if (!authorizeCron(req, res)) return;
  if (!isScheduledCleanupTime()) {
    return res.json({ success: true, skipped: true, reason: 'Outside the scheduled 11:30 PM cleanup window' });
  }

  try {
    const staleCleanup = await cleanupStaleProjects();
    res.json({ success: true, staleCleanup });
  } catch (err) {
    console.error('[cron] stale-project-cleanup failed:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
module.exports.isScheduledCleanupTime = isScheduledCleanupTime;
