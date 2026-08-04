import { isValidProjectDeadline, minimumProjectDeadline } from './deadline-validation';

describe('deadline validation', () => {
  const now = new Date(2026, 7, 3, 23, 30);

  it('sets the minimum project deadline to the next local calendar day', () => {
    expect(minimumProjectDeadline(now)).toBe('2026-08-04');
  });

  it('rejects today and past dates while accepting tomorrow', () => {
    expect(isValidProjectDeadline('2026-08-02', now)).toBe(false);
    expect(isValidProjectDeadline('2026-08-03', now)).toBe(false);
    expect(isValidProjectDeadline('2026-08-04', now)).toBe(true);
  });

  it('rejects missing and malformed deadlines', () => {
    expect(isValidProjectDeadline('', now)).toBe(false);
    expect(isValidProjectDeadline('08/04/2026', now)).toBe(false);
  });
});
