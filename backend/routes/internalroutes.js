const express = require('express');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');
const router = express.Router();

// Called daily by Vercel Cron. Vercel automatically sends:
//   Authorization: Bearer <CRON_SECRET>
router.post('/internal/deadline-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const count = await sendDeadlineReminders();
    res.json({ success: true, remindersSent: count });
  } catch (err) {
    console.error('[cron] deadline-reminders failed:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
