import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
const admin = '00000000-0000-4000-8000-000000000001'
const business = '00000000-0000-4000-8000-000000000010'
const inactive = '00000000-0000-4000-8000-000000000011'
const visitor = '00000000-0000-4000-8000-000000000020'
let nextId = 100
const record = (type = 'view', source = 'details', id = business, who = visitor) => db.query(
  'INSERT INTO public.listing_events(id,business_id,visitor_id,event_type,source) VALUES ($1,$2,$3,$4,$5)',
  [`00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`, id, who, type, source])
const stats = async (id = business, start = '2026-09-13', end = start) =>
  (await db.query('SELECT public.admin_listing_stats($1,$2,$3) AS stats', [id, start, end])).rows[0].stats

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT auth.uid() = '${admin}'::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.businesses (id uuid PRIMARY KEY, is_active boolean NOT NULL);
    INSERT INTO public.businesses VALUES ('${business}',true), ('${inactive}',false);
    ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_read ON public.businesses FOR SELECT TO anon, authenticated USING (is_active OR public.is_admin());
    GRANT SELECT ON public.businesses TO anon, authenticated;
  `)
  // Fixture helper is callable by anon, just as in the existing admin setup.
  await db.exec('GRANT USAGE ON SCHEMA auth TO anon')
  const setup = await readFile(new URL('../supabase/listing_analytics_setup.sql', import.meta.url), 'utf8')
  await db.exec(setup)
  await db.exec(setup)
  await db.exec('SET ROLE anon')
  await record()
  await record('call')
  await assert.rejects(record('invalid'), /check constraint/)
  await assert.rejects(record('view', 'invalid'), /check constraint/)
  await assert.rejects(record('view', 'details', inactive), /row-level security/)
  await assert.rejects(record('view', 'details', '00000000-0000-4000-8000-000000000099'), /row-level security/)
  await assert.rejects(db.query('SELECT * FROM public.listing_events'), /permission denied/)
  await assert.rejects(db.query('UPDATE public.listing_events SET source=\'map\''), /permission denied/)
  await assert.rejects(db.query('DELETE FROM public.listing_events'), /permission denied/)
  await assert.rejects(db.query(`INSERT INTO public.listing_events(id,business_id,visitor_id,event_type,source,created_at)
    VALUES (gen_random_uuid(),'${business}','${visitor}','view','details',now())`), /permission denied/)
  await assert.rejects(stats(), /permission denied/)
  await db.exec(`RESET ROLE; SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${visitor}', false)`)
  await record('whatsapp')
  assert.equal((await db.query('SELECT * FROM public.listing_events')).rows.length, 0)
  await assert.rejects(stats(), /Administrator access required/)
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${admin}', false)`)
  assert.equal((await db.query('SELECT * FROM public.listing_events')).rows.length, 3)
  await db.exec('RESET ROLE')
  await db.exec("DELETE FROM public.listing_events")
  // Server-time fixtures straddle midnight in South Africa (UTC+2).
  const fixtures = [
    ['2026-09-12T21:59:59Z', 'view', 'details', visitor],
    ['2026-09-12T22:00:00Z', 'view', 'details', visitor],
    ['2026-09-13T10:00:00Z', 'listing_open', 'featured', visitor],
    ['2026-09-13T11:00:00Z', 'call', 'details', visitor],
    ['2026-09-13T12:00:00Z', 'call', 'details', visitor],
    ['2026-09-13T21:59:59Z', 'whatsapp', 'popup', admin],
    ['2026-09-13T22:00:00Z', 'photo', 'details', admin],
  ]
  for (const [time, type, source, who] of fixtures) await db.query(
    'INSERT INTO public.listing_events VALUES (gen_random_uuid(),$1,$2,$3,$4,$5)', [business, who, type, source, time])
  await db.exec('SET ROLE authenticated')
  const report = await stats()
  assert.deepEqual(report.totals, { views: 1, unique_visitors: 2, interacting_visitors: 2, clicks: 4 })
  assert.deepEqual(report.actions.find(a => a.event_type === 'call'), { event_type: 'call', clicks: 2, visitors: 1 })
  assert.deepEqual(report.sources, [{ source: 'featured', opens: 1, visitors: 1 }])
  assert.deepEqual(report.daily, [{ day: '2026-09-13', views: 1, clicks: 4, visitors: 2 }])
  assert.equal((await stats(business, '2026-09-01')).totals.views, 0)
  assert.equal((await stats(inactive)).totals.clicks, 0)
  await assert.rejects(stats(business, '2026-09-15', '2026-09-13'), /valid date range/)
  await assert.rejects(stats(business, '2020-01-01', '2026-09-13'), /valid date range/)
  console.log('Analytics database checks passed: permissions, event validation, admin reports, distinct visitors, empty ranges, listing isolation and South African midnight boundaries.')
} finally { await db.close() }
