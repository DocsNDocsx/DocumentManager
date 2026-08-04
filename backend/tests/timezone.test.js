const { calendarDateInTimeZone, isFutureDeadline, resolveTimeZone } = require('../utils/timezone');

describe('project deadline timezone validation', () => {
  const utcAfterMidnight = new Date('2026-08-04T02:06:00Z');

  it('treats August 4 as tomorrow while it is still August 3 in Central Time', () => {
    expect(calendarDateInTimeZone(utcAfterMidnight, 'America/Chicago')).toBe('2026-08-03');
    expect(isFutureDeadline('2026-08-04', 'America/Chicago', utcAfterMidnight)).toBe(true);
  });

  it('accepts a database Date object for tomorrow in the owner timezone', () => {
    const databaseDeadline = new Date('2026-08-04T00:00:00.000Z');
    expect(isFutureDeadline(databaseDeadline, 'UTC-6', utcAfterMidnight)).toBe(true);
  });

  it('rejects the same calendar day in the user timezone', () => {
    expect(isFutureDeadline('2026-08-03', 'America/Chicago', utcAfterMidnight)).toBe(false);
  });

  it('maps legacy saved offset values to IANA timezones', () => {
    expect(resolveTimeZone('UTC-6')).toBe('America/Chicago');
  });
});
