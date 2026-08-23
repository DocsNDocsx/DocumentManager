const { normalizeEmail, normalizeStaff, soloProjectRoles, isSupportStaff } = require('../utils/projectRoles');

describe('project role resolution', () => {
  it('keeps host, staff, and collaborator as independent simultaneous roles', () => {
    const project = {
      user_id: '123',
      staff: JSON.stringify({ email: ' Person@Example.com ' }),
      collaborators: JSON.stringify([{ userId: '123', email: 'person@example.com' }]),
    };
    expect(soloProjectRoles(project, { id: '123', email: 'PERSON@example.com' }))
      .toEqual(['host', 'staff', 'collaborator']);
  });

  it('does not grant collaborator access for an inactive collaborator', () => {
    expect(soloProjectRoles({
      user_id: '999', staff: null,
      collaborators: [{ email: 'person@example.com', status: 'inactive' }],
    }, { id: '123', email: 'person@example.com' })).toEqual([]);
  });

  it('normalizes valid staff and rejects malformed staff email addresses', () => {
    expect(normalizeEmail(' Person@Example.COM ')).toBe('person@example.com');
    expect(normalizeStaff({ email: ' Person@Example.COM ', firstName: ' Sam ' }))
      .toEqual({ email: 'person@example.com', firstName: 'Sam' });
    expect(normalizeStaff({ email: 'not-an-email' })).toBeUndefined();
    expect(isSupportStaff({ support_staff: '{"email":"person@example.com"}' }, 'PERSON@example.com', 'support_staff')).toBe(true);
  });
});
