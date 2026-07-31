const {
  computeMonthlyAmountCents,
  computeDiscountCents,
  getVoucher,
  normalizeVoucherCode,
  RATE,
  TAX_RATE,
} = require('../utils/stripe');

describe('Stripe pricing utilities', () => {
  it('calculates usage price with tax in cents', () => {
    const cents = computeMonthlyAmountCents({
      projects: 2,
      collaborators: 3,
      documents: 4,
      days: 10,
    });

    expect(cents).toBe(Math.round(2 * 3 * 4 * 10 * RATE * (1 + TAX_RATE) * 100));
  });

  it('floors decimal usage inputs', () => {
    const cents = computeMonthlyAmountCents({
      projects: 2.9,
      collaborators: 3.7,
      documents: 4.2,
      days: 10.8,
    });

    expect(cents).toBe(Math.round(2 * 3 * 4 * 10 * RATE * (1 + TAX_RATE) * 100));
  });

  it('uses minimum usage fallbacks for invalid values', () => {
    const cents = computeMonthlyAmountCents({
      projects: 0,
      collaborators: 'bad',
      documents: -4,
      days: undefined,
    });

    expect(cents).toBe(Math.round(1 * 1 * 1 * 20 * RATE * (1 + TAX_RATE) * 100));
  });

  it('charges per document as part of the usage multiplier', () => {
    const oneDocument = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 1,
      days: 20,
    });
    const fiveDocuments = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 5,
      days: 20,
    });

    expect(oneDocument).toBe(194);
    expect(fiveDocuments).toBe(972);
  });

  it('uses the actual duration and does not cap pricing at 31 days', () => {
    const cents = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 5,
      days: 90,
    });

    expect(cents).toBe(4374);
  });

  it('normalizes and resolves supported voucher codes', () => {
    expect(normalizeVoucherCode(' welcome10 ')).toBe('WELCOME10');
    expect(getVoucher('launch25')).toEqual({
      code: 'LAUNCH25',
      percentOff: 25,
      label: 'Launch voucher',
    });
    expect(getVoucher('missing')).toBeNull();
  });

  it('applies voucher discounts to server-side pricing', () => {
    const fullPrice = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 5,
      days: 20,
    });
    const discounted = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 5,
      days: 20,
      voucherCode: 'WELCOME10',
    });

    expect(fullPrice).toBe(972);
    expect(computeDiscountCents(fullPrice, 'WELCOME10')).toBe(97);
    expect(discounted).toBe(875);
  });
});
