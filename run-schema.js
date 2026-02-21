require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const { Client } = require('pg');

const sql = fs.readFileSync(__dirname + '/backend/scripts/supabase-schema.sql', 'utf8');

const client = new Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase Postgres');
    await client.query(sql);
    console.log('Schema applied successfully');
    await client.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
run();
