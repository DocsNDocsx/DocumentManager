const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.DB_CLIENT = process.env.DB_CLIENT || 'mysql';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
