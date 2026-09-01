const {
  computeMonthlyAmountCents,
  computeDiscountCents,
  computeStripeProcessingFeeCents,
  getVoucher,
  normalizeVoucherCode,
  RATE,
  STRIPE_CARD_PERCENT_FEE,
  STRIPE_CARD_FIXED_FEE_CENTS,
} = require('../utils/stripe');

describe('Stripe pricing utilities', () => {
  it('calculates usage price plus processing fee in cents', () => {
    const cents = computeMonthlyAmountCents({
      projects: 2,
      collaborators: 3,
      documents: 4,
      days: 10,
    });
    const usageCents = Math.round(2 * 3 * 4 * 10 * RATE * 100);

    expect(cents).toBe(usageCents + computeStripeProcessingFeeCents(usageCents));
  });

  it('floors decimal usage inputs', () => {
    const cents = computeMonthlyAmountCents({
      projects: 2.9,
      collaborators: 3.7,
      documents: 4.2,
      days: 10.8,
    });
    const usageCents = Math.round(2 * 3 * 4 * 10 * RATE * 100);

    expect(cents).toBe(usageCents + computeStripeProcessingFeeCents(usageCents));
  });

  it('uses minimum usage fallbacks for invalid values', () => {
    const cents = computeMonthlyAmountCents({
      projects: 0,
      collaborators: 'bad',
      documents: -4,
      days: undefined,
    });
    const usageCents = Math.round(1 * 1 * 1 * 20 * RATE * 100);

    expect(cents).toBe(usageCents + computeStripeProcessingFeeCents(usageCents));
  });

  it('calculates the Stripe domestic card processing fee', () => {
    expect(computeStripeProcessingFeeCents(972)).toBe(
      Math.round(972 * STRIPE_CARD_PERCENT_FEE) + STRIPE_CARD_FIXED_FEE_CENTS
    );
    expect(computeStripeProcessingFeeCents(0)).toBe(0);
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

    expect(oneDocument).toBe(215);
    expect(fiveDocuments).toBe(956);
  });

  it('prices solo-private usage from assignments instead of the collaborator/document cross product', () => {
    const cents = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 2,
      documents: 3,
      assignmentCount: 2,
      days: 10,
    });
    const usageCents = Math.round(2 * 10 * RATE * 100);

    expect(cents).toBe(usageCents + computeStripeProcessingFeeCents(usageCents));
  });

  it('uses the actual duration and does not cap pricing at 31 days', () => {
    const cents = computeMonthlyAmountCents({
      projects: 1,
      collaborators: 1,
      documents: 5,
      days: 90,
    });

    expect(cents).toBe(4197);
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

    const fullPriceBeforeFee = 900;
    const discountedBeforeFee = fullPriceBeforeFee - computeDiscountCents(fullPriceBeforeFee, 'WELCOME10');

    expect(fullPrice).toBe(956);
    expect(computeDiscountCents(fullPriceBeforeFee, 'WELCOME10')).toBe(90);
    expect(discounted).toBe(discountedBeforeFee + computeStripeProcessingFeeCents(discountedBeforeFee));
  });
});
