const fs = require('fs');
const path = require('path');
const pool = require('./sql');
const logActivity = require('./logActivity');
const { sendEmail } = require('./emailservice');
const { escapeHtml } = require('./html');
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
// Run only after the activation transaction commits; notification failure cannot undo activation.
module.exports = async function notifyActivation(user, project, type, projectCode) {
 try {
  await logActivity(user.userid, 'settings', 'Project "' + project.name + '" was activated', null, project.name);
  const collaborators = type === 'team'
   ? (await pool.query('SELECT first_name AS firstName, last_name AS lastName, email FROM team_project_collaborators WHERE project_id = ?', [project.id]))[0]
   : (json(project.collaborators) || []).filter(person => person.status !== 'inactive');
  const staff = json(type === 'team' ? project.support_staff : project.staff);
  const recipients = [{email:user.email,firstName:user.firstname,lastName:user.lastname}, ...collaborators, ...(staff?.email ? [{...staff,recipientRole:'staff'}] : [])];
  const template = fs.readFileSync(path.join(__dirname,'../templates-email/projectactivation.html'),'utf8');
  const base = process.env.APP_BASE_URL || '';
  await Promise.all(recipients.filter(person => person.email).map(person => {
   const name = [person.firstName,person.lastName].filter(Boolean).join(' ') || person.name || 'Collaborator';
   const access = person.recipientRole === 'staff'
    ? '<p><strong>Your role:</strong> Support Staff</p><p><a href="' + escapeHtml(base + (type === 'team' ? '/top-menu-team-projects' : '/top-menu-solo-projects') + '?projectId=' + encodeURIComponent(project.id)) + '">Open project as support staff</a></p>' : '';
   const body = template.replaceAll('{{BASE_URL}}',escapeHtml(base))
    .replace('{{COLLABORATOR_NAME}}',escapeHtml(name)).replace('{{PROJECT_NAME}}',escapeHtml(project.name))
    .replace('{{DEADLINE_BLOCK}}', '<p><strong>Deadline:</strong> ' + escapeHtml(new Date(project.deadline).toDateString()) + '</p>')
    .replace('{{PROJECT_CODE_BLOCK}}',projectCode ? '<p><strong>Project Code:</strong> ' + escapeHtml(projectCode) + '</p>' : '')
    .replace('{{ACCESS_BLOCK}}',access);
   return sendEmail(person.email, 'DocsNDocs: "' + project.name + '" is now active', body);
  }));
 } catch (error) { console.error('Coupon activation notification failed:',error.message); }
};
