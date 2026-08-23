function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function soloProjectRoles(project, user) {
  const roles = [];
  const userId = String(user?.id ?? user?.userId ?? '');
  const email = normalizeEmail(user?.email);
  if (userId && String(project?.user_id ?? project?.userId ?? '') === userId) roles.push('host');

  const staff = parseJson(project?.staff, null);
  if (email && normalizeEmail(staff?.email) === email) roles.push('staff');

  const collaborators = parseJson(project?.collaborators, []);
  const isCollaborator = collaborators.some(collaborator => {
    if (collaborator?.status === 'inactive') return false;
    const collaboratorId = collaborator?.userId ?? collaborator?.userid ?? collaborator?.user_id;
    return (userId && String(collaboratorId ?? '') === userId)
      || (email && normalizeEmail(collaborator?.email) === email);
  });
  if (isCollaborator) roles.push('collaborator');
  return roles;
}

function isSupportStaff(project, email, field = 'staff') {
  const staff = parseJson(project?.[field], null);
  return Boolean(normalizeEmail(email) && normalizeEmail(staff?.email) === normalizeEmail(email));
}

function normalizeStaff(value) {
  if (value == null) return null;
  const email = normalizeEmail(value.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  return {
    ...(value.firstName !== undefined ? { firstName: String(value.firstName).trim() } : {}),
    ...(value.lastName !== undefined ? { lastName: String(value.lastName).trim() } : {}),
    email,
    ...(value.affiliation !== undefined ? { affiliation: String(value.affiliation).trim() } : {}),
  };
}

module.exports = { normalizeEmail, parseJson, soloProjectRoles, isSupportStaff, normalizeStaff };
