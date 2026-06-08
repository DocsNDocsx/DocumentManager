/**
 * Seed script: creates one active private project with 5 collaborators and 5 documents.
 *
 * Usage:
 *   node backend/seed.js --userid 1
 *   node backend/seed.js --userid=1
 */

const { randomUUID } = require('crypto');
const pool = require('./utils/sql');

function getUserId() {
  const args = process.argv.slice(2);
  const flagIdx = args.findIndex(a => a === '--userid');
  if (flagIdx !== -1 && args[flagIdx + 1]) return args[flagIdx + 1];
  const eq = args.find(a => a.startsWith('--userid='));
  if (eq) return eq.split('=')[1];
  return null;
}

const userid = getUserId();
if (!userid) {
  console.error('Usage: node backend/seed.js --userid <userid>');
  process.exit(1);
}

const collaborators = [
  { firstName: 'Alice',  lastName: 'Johnson',  email: 'alice.johnson@example.com',  affiliation: 'Stanford University' },
  { firstName: 'Bob',    lastName: 'Smith',    email: 'bob.smith@example.com',       affiliation: 'MIT' },
  { firstName: 'Carol',  lastName: 'Williams', email: 'carol.williams@example.com',  affiliation: 'Harvard University' },
  { firstName: 'David',  lastName: 'Brown',    email: 'david.brown@example.com',     affiliation: 'UC Berkeley' },
  { firstName: 'Emma',   lastName: 'Davis',    email: 'emma.davis@example.com',      affiliation: 'Yale University' },
];

const documents = [
  { name: 'Resume / CV',                fileTypes: ['PDF', 'DOCX'],        maxSize: '10', sizeUnit: 'MB', templateName: '' },
  { name: 'Personal Statement',         fileTypes: ['PDF', 'DOCX'],        maxSize: '5',  sizeUnit: 'MB', templateName: '' },
  { name: 'Official Transcripts',       fileTypes: ['PDF'],                maxSize: '20', sizeUnit: 'MB', templateName: '' },
  { name: 'Letters of Recommendation', fileTypes: ['PDF', 'DOCX'],        maxSize: '15', sizeUnit: 'MB', templateName: '' },
  { name: 'Writing Sample',            fileTypes: ['PDF', 'DOCX', 'DOC'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
];

// assignments keys are string-coerced indices because JSON object keys are always
// strings. The frontend reads them as project.assignments[String(collabIndex)].
// Values are arrays of document indices that collaborator must submit.
const assignments = Object.fromEntries(
  collaborators.map((_, i) => [String(i), documents.map((_, j) => j)])
);

async function seed() {
  try {
    const id = randomUUID();

    // Insert directly as status='active', completed_step=6 to bypass the
    // 6-step wizard UI — this is demo data, not a real wizard session.
    await pool.query(
      `INSERT INTO projects
         (id, user_id, name, description, deadline, status, completed_step, type,
          collaborators, documents, assignments, attachments)
       VALUES (?, ?, ?, ?, ?, 'active', 6, 'private', ?, ?, ?, ?)`,
      [
        id,
        Number(userid),
        '2026 Graduate Program Applications',
        'Collect application documents from graduate program candidates for the 2026 cohort.',
        '2026-08-31',
        JSON.stringify(collaborators),
        JSON.stringify(documents),
        JSON.stringify(assignments),
        JSON.stringify([]),
      ]
    );

    console.log('\n✅ Project seeded successfully!\n');
    console.log(`   ID:            ${id}`);
    console.log(`   Name:          2026 Graduate Program Applications`);
    console.log(`   Owner user_id: ${userid}`);
    console.log(`   Collaborators: ${collaborators.length}`);
    console.log(`   Documents:     ${documents.length}`);
    console.log(`   Status:        active`);
    console.log('\n🔗 Collaborator view URLs (open in browser):');
    for (let i = 0; i < collaborators.length; i++) {
      const c = collaborators[i];
      console.log(`   ${c.firstName} ${c.lastName} (${c.affiliation})`);
      console.log(`     http://localhost:4200/collaborator-view/${id}/${i}`);
    }
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seed();
