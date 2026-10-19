import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT auth.uid() = '00000000-0000-4000-8000-000000000001'::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.businesses (id integer PRIMARY KEY, name text, is_active boolean DEFAULT true);
    INSERT INTO businesses VALUES (1, 'Existing', true);
    ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_access ON businesses TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON businesses TO authenticated;
  `)
  const sql = await readFile(new URL('../supabase/admin_business_phase_setup.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.equal((await db.query('SELECT launch_phase FROM businesses')).rows[0].launch_phase, 'live')
  await db.exec(`SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false)`)
  await db.exec("UPDATE businesses SET name = 'Owner edit' WHERE id = 1")
  await assert.rejects(db.exec("UPDATE businesses SET launch_phase = 'demo' WHERE id = 1"), /Only administrators/)
  await assert.rejects(db.exec("INSERT INTO businesses (id, launch_phase) VALUES (2, 'demo')"), /Only administrators/)
  await db.exec('INSERT INTO businesses (id) VALUES (2)')
  await db.exec("SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false)")
  await db.exec("UPDATE businesses SET launch_phase = 'demo' WHERE id = 1")
  assert.deepEqual((await db.query("SELECT id, is_active FROM businesses WHERE launch_phase = 'demo'")).rows, [{ id: 1, is_active: true }])
  await assert.rejects(db.exec("UPDATE businesses SET launch_phase = 'invalid' WHERE id = 1"), /check constraint/)
  await db.exec("UPDATE businesses SET launch_phase = 'live' WHERE id = 1")
  assert.equal((await db.query("SELECT count(*)::int AS count FROM businesses WHERE launch_phase = 'live'")).rows[0].count, 2)
  console.log('Business phase checks passed: defaults, repeat installation, admin toggles, owner restrictions, phase filtering, and active status preserved.')
} finally {
  await db.close()
}
