require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../utils/emailservice');

const TO = 'puneetdwivedi@gmail.com';
const BASE = process.env.APP_BASE_URL ?? '';
const tpl = name => fs.readFileSync(path.join(__dirname, `../templates-email/${name}`), 'utf8');

async function run() {
  // 1. Welcome / register
  const registerBody = tpl('registeruser.html')
    .replace('{{BASE_URL}}', BASE);
  await sendEmail(TO, 'DocsNDocs: Welcome! Your account has been created', registerBody);
  console.log('✅ Register / welcome');

  // 2. Forgot password OTP
  const forgotBody = tpl('forgotpassword.html')
    .replace('{{BASE_URL}}', BASE)
    .replace('{{OTP}}', '847293');
  await sendEmail(TO, 'Your OTP Code for DocsNDocs', forgotBody);
  console.log('✅ Forgot password OTP');

  // 3. Project activation
  const activationBody = tpl('projectactivation.html')
    .replace('{{BASE_URL}}', BASE)
    .replace('{{COLLABORATOR_NAME}}', 'Puneet Dwivedi')
    .replace('{{PROJECT_NAME}}', 'Annual Review Report 2025')
    .replace('{{DEADLINE_BLOCK}}', '<p class="detail-row"><strong>Deadline:</strong> Thu Jan 01 2026</p>')
    .replace('{{PROJECT_CODE_BLOCK}}', '<div class="code-section"><p class="code-label">Project Code</p><div class="code-box"><p class="code-value">ERH4-7MLT</p></div></div>');
  await sendEmail(TO, 'DocsNDocs: "Annual Review Report 2025" is now active — submit your documents', activationBody);
  console.log('✅ Project activation');

  // 5. New submission
  const submissionBody = tpl('newsubmission.html')
    .replace('{{BASE_URL}}', BASE)
    .replace('{{OWNER_NAME}}', 'Puneet Dwivedi')
    .replace('{{PROJECT_NAME}}', 'Annual Review Report 2025')
    .replace('{{COLLABORATOR_NAME}}', 'Alice Tester')
    .replace('{{DOCUMENT_NAME}}', 'Research_Report_Final.pdf');
  await sendEmail(TO, 'DocsNDocs: New submission in "Annual Review Report 2025"', submissionBody);
  console.log('✅ New submission');

  // 6. Submission review — approved
  const approvedBody = tpl('submissionreview.html')
    .replaceAll('{{BASE_URL}}', BASE)
    .replaceAll('{{COLLABORATOR_NAME}}', 'Puneet Dwivedi')
    .replaceAll('{{PROJECT_NAME}}', 'Annual Review Report 2025')
    .replaceAll('{{STATUS_CLASS}}', 'status-approved')
    .replaceAll('{{STATUS_LABEL}}', 'Approved')
    .replaceAll('{{DOCUMENT_NAME}}', 'Research_Report_Final.pdf')
    .replaceAll('{{FEEDBACK_BLOCK}}', '')
    .replaceAll('{{STATUS_MESSAGE}}', 'Your document has been approved. No further action is required.');
  await sendEmail(TO, 'DocsNDocs: Your submission for "Annual Review Report 2025" has been approved', approvedBody);
  console.log('✅ Submission review (approved)');

  // 7. Submission review — revision
  const revisionBody = tpl('submissionreview.html')
    .replaceAll('{{BASE_URL}}', BASE)
    .replaceAll('{{COLLABORATOR_NAME}}', 'Puneet Dwivedi')
    .replaceAll('{{PROJECT_NAME}}', 'Annual Review Report 2025')
    .replaceAll('{{STATUS_CLASS}}', 'status-revision')
    .replaceAll('{{STATUS_LABEL}}', 'Revision Required')
    .replaceAll('{{DOCUMENT_NAME}}', 'Research_Report_Final.pdf')
    .replaceAll('{{FEEDBACK_BLOCK}}', '<div class="feedback-box"><p class="feedback-label">Feedback from Reviewer</p><p class="feedback-text">Please update section 3 with the latest figures and reformat the charts as per the provided style guide before resubmitting.</p></div>')
    .replaceAll('{{STATUS_MESSAGE}}', 'Please review the feedback above and resubmit your document.');
  await sendEmail(TO, 'DocsNDocs: Revision requested for your submission in "Annual Review Report 2025"', revisionBody);
  console.log('✅ Submission review (revision)');

  // 5. Password changed
  const pwBody = tpl('passwordchanged.html')
    .replace('{{BASE_URL}}', BASE);
  await sendEmail(TO, 'DocsNDocs: Your password has been changed', pwBody);
  console.log('✅ Password changed');

  // 8. Deadline reminder
  await testReminderTemplate();

  console.log('\nAll 8 emails sent to', TO);
}

// To test the deadline reminder template directly (bypasses DB query):
async function testReminderTemplate() {
  const reminderBody = tpl('reminderdeadline.html')
    .replaceAll('{{BASE_URL}}', BASE)
    .replaceAll('{{COLLABORATOR_NAME}}', 'Puneet Dwivedi')
    .replaceAll('{{PROJECT_NAME}}', 'Annual Review Report 2025')
    .replaceAll('{{DEADLINE_DATE}}', 'Thu Jan 01 2026')
    .replaceAll('{{DAYS_LEFT}}', '3')
    .replaceAll('{{DAYS_LEFT_LABEL}}', 'days remaining');
  await sendEmail(TO, 'DocsNDocs: Reminder — "Annual Review Report 2025" deadline in 3 days', reminderBody);
  console.log('✅ Deadline reminder (3 days)');
}

const args = process.argv.slice(2);
if (args.includes('--reminder')) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  testReminderTemplate().catch(err => { console.error('❌ Failed:', err.message); process.exit(1); });
} else {
  run().catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
}
