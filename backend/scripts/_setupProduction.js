'use strict';
/**
 * One-shot production setup:
 * 1. Runs supabase-schema.sql against the live Supabase DB
 * 2. Creates the admin user  admin@bluewallet.security / Italy101!@
 */
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://vwbijbycnqobdlvnyisw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YmlqYnljbnFvYmRsdm55aXN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUzNjc0OSwiZXhwIjoyMDg3MTEyNzQ5fQ.KEd5l46hC2aR8T8ZzcrcZrT1vGAnM5GEKuLoJ4SmLN4';
const POSTGRES_URL = 'postgres://postgres.vwbijbycnqobdlvnyisw:RMkA8YfVFP5a4Zqe@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true';

const ADMIN_EMAIL = 'admin@bluewallet.security';
const ADMIN_PASSWORD = 'Italy101!@';

async function runSchema() {
  console.log('\n=== STEP 1: Running SQL schema ===');
  const client = new Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase PostgreSQL');

  const schemaPath = path.join(__dirname, 'supabase-schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Split on semicolons but be careful with multiline statements
  // Execute the whole thing as one batch
  await client.query(sql);
  console.log('Schema applied successfully.');
  await client.end();
}

async function createAdmin() {
  console.log('\n=== STEP 2: Creating admin user ===');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Check if admin already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  if (existing) {
    console.log(`Admin already exists: ${existing.email} (id=${existing.id})`);
    // Ensure role is admin
    if (existing.role !== 'admin') {
      await supabase.from('users').update({ role: 'admin' }).eq('id', existing.id);
      console.log('Role updated to admin.');
    } else {
      console.log('Role is already admin. Nothing to do.');
    }
    return;
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

  const { data, error } = await supabase.from('users').insert({
    email: ADMIN_EMAIL,
    password: passwordHash,
    name: 'Admin',
    role: 'admin',
    is_admin: true,
    kyc_status: 'approved',
    recovery_status: 'NO_KYC',
    two_factor_enabled: false,
  }).select('id, email, role').single();

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`Admin created: ${data.email} (id=${data.id})`);
}

async function main() {
  try {
    await runSchema();
    await createAdmin();
    console.log('\n=== Setup complete ===');
    console.log('Login: admin@bluewallet.security / Italy101!@');
  } catch (err) {
    console.error('\nSetup failed:', err.message);
    process.exit(1);
  }
}

main();
