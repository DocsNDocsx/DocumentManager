const express = require('express');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');
const { cleanupStaleProjects } = require('../utils/staleProjectCleanup');
const router = express.Router();

function authorizeCron(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  return true;
}

// Called daily by Vercel Cron. Vercel automatically sends:
//   Authorization: Bearer <CRON_SECRET>
router.post('/internal/deadline-reminders', async (req, res) => {
  if (!authorizeCron(req, res)) return;

  const [reminderResult, cleanupResult] = await Promise.allSettled([
    sendDeadlineReminders(),
    cleanupStaleProjects(),
  ]);

  if (reminderResult.status === 'rejected') {
    console.error('[cron] deadline-reminders failed:', reminderResult.reason?.message ?? reminderResult.reason);
  }
  if (cleanupResult.status === 'rejected') {
    console.error('[cron] stale-project-cleanup failed:', cleanupResult.reason?.message ?? cleanupResult.reason);
  }

  const success = reminderResult.status === 'fulfilled' && cleanupResult.status === 'fulfilled';
  res.status(success ? 200 : 500).json({
    success,
    remindersSent: reminderResult.status === 'fulfilled' ? reminderResult.value : null,
    staleCleanup: cleanupResult.status === 'fulfilled' ? cleanupResult.value : null,
  });
});

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

module.exports = router;
