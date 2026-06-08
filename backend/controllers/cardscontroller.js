const pool = require('../utils/sql');

exports.getCards = async (req, res) => {
  try {
    const { userid, type = 'solo' } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [rows] = await pool.query(
      'SELECT id, last4, card_type, card_holder, expiry_month, expiry_year, is_default FROM payment_cards WHERE userid = ? AND type = ? ORDER BY is_default DESC, created_at ASC',
      [userid, type]
    );

    res.json({ success: true, cards: rows.map(formatCard) });
  } catch (err) {
    console.error('Get cards error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.addCard = async (req, res) => {
  try {
    const { userid, last4, card_type, card_holder, expiry_month, expiry_year, is_default, type = 'solo' } = req.body;
    if (!userid || !last4 || !card_holder || !expiry_month || !expiry_year) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (is_default) {
      await pool.query('UPDATE payment_cards SET is_default = false WHERE userid = ? AND type = ?', [userid, type]);
    }

    const [result] = await pool.query(
      'INSERT INTO payment_cards (userid, last4, card_type, card_holder, expiry_month, expiry_year, is_default, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [userid, last4, card_type ?? 'generic', card_holder.toUpperCase(), expiry_month, expiry_year, is_default ? true : false, type]
    );

    const [rows] = await pool.query('SELECT id, last4, card_type, card_holder, expiry_month, expiry_year, is_default FROM payment_cards WHERE id = ?', [result.insertId]);
    res.json({ success: true, card: formatCard(rows[0]) });
  } catch (err) {
    console.error('Add card error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.setDefault = async (req, res) => {
  try {
    const { id } = req.params;
    const { userid, type = 'solo' } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    await pool.query('UPDATE payment_cards SET is_default = false WHERE userid = ? AND type = ?', [userid, type]);
    await pool.query('UPDATE payment_cards SET is_default = true WHERE id = ? AND userid = ?', [id, userid]);

    res.json({ success: true });
  } catch (err) {
    console.error('Set default error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteCard = async (req, res) => {
  try {
    const { id } = req.params;
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    await pool.query('DELETE FROM payment_cards WHERE id = ? AND userid = ?', [id, userid]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete card error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

function formatCard(row) {
  const month = String(row.expiry_month).padStart(2, '0');
  const year = String(row.expiry_year).slice(-2);
  return {
    id: row.id,
    number: `•••• •••• •••• ${row.last4}`,
    name: row.card_holder,
    expiry: `${month}/${year}`,
    type: row.card_type,
    isDefault: row.is_default === true,
  };
}
