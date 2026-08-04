const LEGACY_TIME_ZONES = {
  'UTC-5': 'America/New_York',
  'UTC-6': 'America/Chicago',
  'UTC-7': 'America/Denver',
  'UTC-8': 'America/Los_Angeles',
  'UTC+0': 'UTC',
  'UTC+1': 'Europe/Paris',
};

function resolveTimeZone(value) {
  const candidate = LEGACY_TIME_ZONES[value] ?? value ?? 'America/New_York';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'America/New_York';
  }
}

function calendarDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function deadlineCalendarDate(deadline) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(deadline ?? ''));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function isFutureDeadline(deadline, timeZone, now = new Date()) {
  const dueDate = deadlineCalendarDate(deadline);
  if (!dueDate) return false;
  return dueDate > calendarDateInTimeZone(now, timeZone);
}

module.exports = { calendarDateInTimeZone, deadlineCalendarDate, isFutureDeadline, resolveTimeZone };
