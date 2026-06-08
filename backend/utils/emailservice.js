async function sendEmail(to, subject, htmlBody) {
  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.SMTP2GO_API_KEY,
      to: [to],
      sender: 'DocsNDocs <mmridul@docsndocs.com>',
      subject,
      html_body: htmlBody,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.data?.error) {
    console.error('[email] SMTP2GO error response:', JSON.stringify(data));
    throw new Error(data.data?.error ?? `SMTP2GO error: ${response.status}`);
  }

  if (data.data?.failed > 0 || data.data?.succeeded === 0) {
    console.error('[email] SMTP2GO delivery failure:', JSON.stringify(data.data));
    throw new Error(`SMTP2GO failed to deliver to ${JSON.stringify(data.data?.failures ?? [])}`);
  }

  console.log('[email] Sent successfully to:', to, '| email_id:', data.data?.email_id);
  return data;
}

module.exports = { sendEmail };
