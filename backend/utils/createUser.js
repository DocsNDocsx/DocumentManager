const pool = require('./sql');


async function insertUser({ userId, firstname, lastname, email, password, designation, organization }){
    try {
      const [rows] = await pool.execute('SELECT 1 FROM users WHERE email = ?', [email]);

    const sql = `
  INSERT INTO users (
    UserId, firstname, lastname, Email, Password, Designation, Organization, isSubscribed
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

const values = [  userId,  firstname ?? null,  lastname ?? null,  email ?? null,  password ?? null,  designation ?? null,  organization ?? null,  'false'];
if (rows.length === 0) {
    const [result] = await pool.execute(sql, values);
    return { inserted: true, insertId: result.insertId };
  } else {
    return { inserted: false, message: 'Email already exists' };
  }

  } catch (err) {
    console.error('Error inserting user:', err);
    throw err;
  }
}
module.exports = { insertUser };