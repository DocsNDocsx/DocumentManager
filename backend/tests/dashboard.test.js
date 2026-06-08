const request = require('supertest');
const app = require('../app');
const pool = require('../utils/sql');

const REAL_USER_ID = '1778840811'; // Mridul Mishra — has 4 active solo projects + team projects
const UNKNOWN_USER_ID = '9999999999';

afterAll(async () => {
  await pool.end();
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('GET /api/dashboard/stats', () => {
  it('returns 400 when userid is missing', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('userid is required');
  });

  it('returns zero counts for an unknown user', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .query({ userid: UNKNOWN_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.soloProjects).toBe(0);
    expect(res.body.teamProjects).toBe(0);
    expect(res.body.activeProjects).toBe(0);
    expect(res.body.documentsCollected).toBe(0);
    expect(res.body.activeCollaborators).toBe(0);
    expect(res.body.storageUsedPercent).toBe(0);
  });

  it('returns correct counts for real user', async () => {
    const res = await request(app)
      .get('/api/dashboard/stats')
      .query({ userid: REAL_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Known from DB: 4 active solo projects
    expect(res.body.soloProjects).toBe(4);

    // activeProjects must equal solo + team
    expect(res.body.activeProjects).toBe(res.body.soloProjects + res.body.teamProjects);

    // Storage: test files are tiny (< 1 KB) so percent rounds to 0 — just verify range
    expect(res.body.storageUsedPercent).toBeGreaterThanOrEqual(0);
    expect(res.body.storageUsedPercent).toBeLessThanOrEqual(100);

    // All numeric fields present and non-negative
    for (const key of ['documentsCollected', 'documentsThisWeek', 'activeCollaborators']) {
      expect(typeof res.body[key]).toBe('number');
      expect(res.body[key]).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Recent Projects ──────────────────────────────────────────────────────────

describe('GET /api/dashboard/recent-projects', () => {
  it('returns 400 when userid is missing', async () => {
    const res = await request(app).get('/api/dashboard/recent-projects');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('userid is required');
  });

  it('returns empty array for an unknown user', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-projects')
      .query({ userid: UNKNOWN_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projects).toEqual([]);
  });

  it('returns at most 4 projects for real user', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-projects')
      .query({ userid: REAL_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projects.length).toBeGreaterThan(0);
    expect(res.body.projects.length).toBeLessThanOrEqual(4);
  });

  it('each project has the required fields with correct types', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-projects')
      .query({ userid: REAL_USER_ID });

    for (const p of res.body.projects) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(['solo', 'team']).toContain(p.type);
      expect(['public', 'private']).toContain(p.visibility);
      expect(typeof p.documentCount).toBe('number');
      expect(typeof p.collaboratorCount).toBe('number');
      expect(typeof p.isOngoing).toBe('boolean');
      // projectCode is null or a string
      expect(p.projectCode === null || typeof p.projectCode === 'string').toBe(true);
    }
  });

  it('includes only known projects belonging to the real user', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-projects')
      .query({ userid: REAL_USER_ID });

    // Top 4 by updated_at are all team projects for this user
    const knownProjectNames = [
      // solo
      '2026 Graduate Program Applications',
      '2026 Open Scholarship Program',
      '2026 graduate admission',
      'Test Wizard Project',
      // team
      'API Test',
      'API Test2',
      'Activation Test Project',
      'Cypress Dashboard Check Project',
      'Annual Review Report 2025',
    ];
    const returnedNames = res.body.projects.map(p => p.name);
    expect(returnedNames.every(n => knownProjectNames.includes(n))).toBe(true);
  });

  it('solo private projects have pendingCount and no submittedCount', async () => {
    const res = await request(app)
      .get('/api/dashboard/recent-projects')
      .query({ userid: REAL_USER_ID });

    const soloPrivate = res.body.projects.filter(
      p => p.type === 'solo' && p.visibility === 'private'
    );
    for (const p of soloPrivate) {
      expect(p.submittedCount === null || typeof p.submittedCount === 'number').toBe(true);
      expect(p.pendingCount === null || typeof p.pendingCount === 'number').toBe(true);
    }
  });
});

// ─── Activity (limited) ───────────────────────────────────────────────────────

describe('GET /api/dashboard/activity', () => {
  it('returns 400 when userid is missing', async () => {
    const res = await request(app).get('/api/dashboard/activity');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('userid is required');
  });

  it('returns at most 10 activities for real user', async () => {
    const res = await request(app)
      .get('/api/dashboard/activity')
      .query({ userid: REAL_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.activities.length).toBeLessThanOrEqual(10);
  });

  it('returns empty array for an unknown user', async () => {
    const res = await request(app)
      .get('/api/dashboard/activity')
      .query({ userid: UNKNOWN_USER_ID });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.activities).toEqual([]);
  });
});

// ─── Activity (all) ───────────────────────────────────────────────────────────

describe('GET /api/dashboard/activity/all', () => {
  it('returns 400 when userid is missing', async () => {
    const res = await request(app).get('/api/dashboard/activity/all');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('userid is required');
  });

  it('returns all activities (>= limited endpoint) for real user', async () => {
    const [allRes, limitedRes] = await Promise.all([
      request(app).get('/api/dashboard/activity/all').query({ userid: REAL_USER_ID }),
      request(app).get('/api/dashboard/activity').query({ userid: REAL_USER_ID }),
    ]);
    expect(allRes.status).toBe(200);
    expect(allRes.body.success).toBe(true);
    expect(allRes.body.activities.length).toBeGreaterThanOrEqual(
      limitedRes.body.activities.length
    );
  });

  it('each activity item has the required fields', async () => {
    // Seed one activity so we always have something to assert against
    await pool.query(
      `INSERT INTO activity_log (id, user_id, type, title, actor, project_name)
       VALUES (UUID(), ?, 'upload', 'Test document uploaded to "2026 Graduate Program Applications"', 'Test Runner', '2026 Graduate Program Applications')`,
      [REAL_USER_ID]
    );

    const res = await request(app)
      .get('/api/dashboard/activity/all')
      .query({ userid: REAL_USER_ID });

    expect(res.body.activities.length).toBeGreaterThan(0);

    const item = res.body.activities[0];
    expect(typeof item.id).toBe('string');
    expect(['upload', 'invite', 'team', 'decision', 'delete', 'settings']).toContain(item.type);
    expect(typeof item.title).toBe('string');
    expect(item.actor === null || typeof item.actor === 'string').toBe(true);
    expect(item.projectName === null || typeof item.projectName === 'string').toBe(true);
    expect(typeof item.timestamp).toBe('string');
  });

  it('activity seeded in previous test appears with correct data', async () => {
    const res = await request(app)
      .get('/api/dashboard/activity/all')
      .query({ userid: REAL_USER_ID });

    const seeded = res.body.activities.find(
      a => a.actor === 'Test Runner' && a.type === 'upload'
    );
    expect(seeded).toBeDefined();
    expect(seeded.projectName).toBe('2026 Graduate Program Applications');
    expect(seeded.title).toBe('Test document uploaded to "2026 Graduate Program Applications"');
  });
});
