import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create table home_hero_slides (id uuid primary key, title text);
    grant select on home_hero_slides to authenticated;
    create table home_hero_events (slide_id uuid, visitor_id uuid, event_type text, created_at timestamptz);
    insert into home_hero_slides values
      ('00000000-0000-4000-8000-000000000001', 'Banner'),
      ('00000000-0000-4000-8000-000000000002', 'No events');
    insert into home_hero_events values
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'view', '2026-10-15 22:00Z'),
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'view', '2026-10-16 10:00Z'),
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'click', '2026-10-16 11:00Z'),
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'view', '2026-10-16 22:00Z'),
      ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000010', 'click', '2026-10-16 11:00Z');
  `)
  const sql = await readFile(new URL('../supabase/home_hero_analytics_setup.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // Setup can safely be rerun.
  await db.exec(`set role authenticated; select set_config('test.admin', 'yes', false)`)
  const { rows } = await db.query(`select * from admin_home_hero_stats('2026-10-16', '2026-10-16')`)
  assert.equal(rows.length, 3)
  assert.equal(Number(rows[0].views), 2)
  assert.equal(Number(rows[0].unique_viewers), 1)
  assert.equal(Number(rows[0].clicks), 1)
  assert.equal(Number(rows[0].unique_ctr_percent), 100)
  assert.equal(rows.find(r => r.title === 'No events').unique_ctr_percent, null)
  assert.equal(Number(rows.find(r => r.title === '[Deleted banner]').clicks), 1)
  await assert.rejects(db.query(`select * from admin_home_hero_stats('2026-10-17', '2026-10-16')`), /valid date range/)
  await db.exec(`select set_config('test.admin', 'no', false)`)
  await assert.rejects(db.query(`select * from admin_home_hero_stats('2026-10-16', '2026-10-16')`), /Administrator/)
  assert.equal((await db.query('select * from home_hero_events')).rows.length, 0)
  await db.exec('set role anon')
  await assert.rejects(db.query(`select * from admin_home_hero_stats('2026-10-16', '2026-10-16')`), /permission denied/)
  console.log('Hero analytics: counts, SA boundaries, deleted/empty banners, validation and access checks passed.')
} finally { await db.close() }
