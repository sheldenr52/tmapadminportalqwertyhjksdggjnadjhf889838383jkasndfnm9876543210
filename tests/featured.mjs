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
    INSERT INTO public.businesses VALUES (1, 'Existing', true);
    ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_access ON public.businesses TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
  `)
  const setup = await readFile(new URL('../supabase/admin_featured_setup.sql', import.meta.url), 'utf8')
  await db.exec(setup)
  await db.exec(setup)
  assert.equal((await db.query('SELECT is_featured FROM businesses')).rows[0].is_featured, false)
  await db.exec(`SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false)`)
  await db.exec("UPDATE businesses SET name = 'Owner edit' WHERE id = 1")
  await assert.rejects(db.exec('UPDATE businesses SET is_featured = true WHERE id = 1'), /Only administrators/)
  await assert.rejects(db.exec("INSERT INTO businesses (id, is_featured) VALUES (2, true)"), /Only administrators/)
  await db.exec("INSERT INTO businesses (id, name) VALUES (2, 'Ordinary')")
  await db.exec("SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false)")
  await db.exec('UPDATE businesses SET is_featured = true WHERE id = 1')
  assert.equal((await db.query('SELECT id FROM businesses WHERE is_active AND is_featured')).rows.length, 1)
  await db.exec('UPDATE businesses SET is_active = false WHERE id = 1')
  assert.equal((await db.query('SELECT id FROM businesses WHERE is_active AND is_featured')).rows.length, 0)
  await db.exec("SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false)")
  await db.exec("UPDATE businesses SET name = 'Still editable' WHERE id = 1")
  await assert.rejects(db.exec('UPDATE businesses SET is_featured = false WHERE id = 1'), /Only administrators/)
  await db.exec("SELECT set_config('request.jwt.claim.sub', '', false)")
  await assert.rejects(db.exec('UPDATE businesses SET is_featured = false WHERE id = 1'), /Only administrators/)
  await db.exec("SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false)")
  await db.exec('UPDATE businesses SET is_featured = false WHERE id = 1')
  assert.equal((await db.query('SELECT is_featured FROM businesses WHERE id = 1')).rows[0].is_featured, false)
  await db.exec('UPDATE businesses SET is_featured = true')
  await db.exec('RESET ROLE')
  const reset = await readFile(new URL('../supabase/reset_featured_businesses.sql', import.meta.url), 'utf8')
  await db.exec(reset)
  assert.equal((await db.query('SELECT id FROM businesses WHERE is_featured')).rows.length, 0)
  await db.exec(`SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false)`)
  await assert.rejects(db.exec('UPDATE businesses SET is_featured = true WHERE id = 1'), /Only administrators/)
  await db.exec("INSERT INTO businesses (id, name) VALUES (3, 'New after reset')")
  assert.equal((await db.query('SELECT is_featured FROM businesses WHERE id = 3')).rows[0].is_featured, false)
  await db.exec("SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false)")
  await db.exec('UPDATE businesses SET is_featured = true WHERE id = 2')
  assert.deepEqual((await db.query('SELECT id FROM businesses WHERE is_active AND is_featured')).rows, [{ id: 2 }])
  console.log('Featured checks passed, including reset of all selections, restored admin protection, new listings off, and manual selection after reset.')
} finally {
  await db.close()
}
