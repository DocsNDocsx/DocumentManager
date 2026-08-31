const fs = require('fs');
const path = require('path');
const { sendEmail } = require('./emailservice');
const { escapeHtml } = require('./html');

async function sendPaymentReceiptEmail({ user, subscriptionId, invoice, amountCents, voucherCode }) {
  try {
    if (!user?.email) return;

    const templatePath = path.join(__dirname, '../templates-email/paymentreceipt.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const receiptUrl = invoice?.hosted_invoice_url || invoice?.invoice_pdf || '';
    const receiptBlock = receiptUrl
      ? `<p><a class="button" href="${escapeHtml(receiptUrl)}">View receipt</a></p>`
      : '';
    const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || 'there';
    const paidAtSeconds = invoice?.status_transitions?.paid_at ?? invoice?.created;
    const paidAt = paidAtSeconds
      ? new Date(paidAtSeconds * 1000).toLocaleDateString('en-US', { timeZone: 'America/New_York' })
      : new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const amount = ((invoice?.amount_paid ?? amountCents ?? 0) / 100).toFixed(2);
    const resolvedSubscriptionId = subscriptionId || invoice?.subscription || invoice?.id || '';

    const body = template
      .replace('{{BASE_URL}}', escapeHtml(process.env.APP_BASE_URL ?? ''))
      .replace('{{CUSTOMER_NAME}}', escapeHtml(name))
      .replace('{{AMOUNT}}', escapeHtml(amount))
      .replace('{{CURRENCY}}', escapeHtml((invoice?.currency ?? 'usd').toUpperCase()))
      .replace('{{SUBSCRIPTION_ID}}', escapeHtml(resolvedSubscriptionId))
      .replace('{{INVOICE_NUMBER}}', escapeHtml(invoice?.number ?? invoice?.id ?? resolvedSubscriptionId))
      .replace('{{PAID_AT}}', escapeHtml(paidAt))
      .replace('{{VOUCHER_BLOCK}}', voucherCode ? `<p class="detail-row"><strong>Voucher:</strong> ${escapeHtml(voucherCode)}</p>` : '')
      .replace('{{RECEIPT_BLOCK}}', receiptBlock);

    await sendEmail(user.email, 'DocsNDocs: Payment receipt', body);
  } catch (emailErr) {
    console.error('[email] Payment receipt email failed (non-fatal):', emailErr);
  }
}

module.exports = { sendPaymentReceiptEmail };
