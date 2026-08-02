jest.mock('../utils/sql', () => ({ query: jest.fn() }));
jest.mock('../utils/emailservice', () => ({ sendEmail: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: jest.fn(() => '{{COLLABORATOR_NAME}} {{PROJECT_NAME}} {{DEADLINE_DATE}} {{DAYS_LEFT}} {{DAYS_LEFT_LABEL}}') }));

const pool = require('../utils/sql');
const { sendEmail } = require('../utils/emailservice');
const { sendDeadlineReminders } = require('../utils/deadlineReminder');

describe('deadline reminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('treats every public-project document as required without assignments', async () => {
    pool.query.mockImplementation(async sql => {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      if (text.startsWith('UPDATE projects') || text.startsWith('UPDATE team_projects')) return [{ affectedRows: 0 }];
      if (text.includes('FROM projects') && text.includes("status = 'active'")) {
        return [[{
          id: 'project-1', name: 'Public Intake', type: 'public',
          deadline: new Date(Date.now() + 86400000),
          collaborators: JSON.stringify([{ firstName: 'Ava', email: 'ava@example.com' }]),
          documents: JSON.stringify([{ name: 'One' }, { name: 'Two' }]),
          assignments: JSON.stringify({}),
        }]];
      }
      if (text.includes('FROM submissions')) return [[]];
      if (text.includes('FROM team_projects')) return [[]];
      throw new Error(`Unexpected SQL: ${text}`);
    });

    const sent = await sendDeadlineReminders();

    expect(sent).toBe(3);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail).toHaveBeenCalledWith(
      'ava@example.com',
      expect.stringContaining('Public Intake'),
      expect.stringContaining('Ava'),
    );
  });
});
