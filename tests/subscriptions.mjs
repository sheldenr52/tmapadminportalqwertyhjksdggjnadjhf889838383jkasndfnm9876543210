import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

// Runs the real setup/functions in an isolated PostgreSQL engine, never production.
const db = new PGlite()
const admin = '00000000-0000-4000-8000-000000000001'
const owner = '00000000-0000-4000-8000-000000000002'
let request = 100
const nextRequest = () => `00000000-0000-4000-8000-${String(++request).padStart(12, '0')}`
const query = async (sql, values = []) => (await db.query(sql, values)).rows
const details = async () => (await query('select public.admin_subscription_details($1) as result', [owner]))[0].result
const extend = async (expiry, id = nextRequest()) => (await query(
  'select public.admin_extend_trial_month($1, $2, $3) as result', [owner, id, expiry]))[0].result

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT auth.uid() = '${admin}'::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.user_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
      email text NOT NULL, subscription_status text CHECK (subscription_status IN ('active','inactive','paused','cancelled','failed','pending')),
      plan_name text NOT NULL, amount numeric NOT NULL, frequency text NOT NULL,
      last_paid_date date, next_billing_date date, grace_period_end date,
      subscription_start_date date, updated_at timestamptz DEFAULT now(), payfast_token text
    );
    ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
    CREATE UNIQUE INDEX active_owner ON public.user_subscriptions(user_id) WHERE subscription_status = 'active';
    INSERT INTO auth.users VALUES ('${admin}', 'admin@example.test'), ('${owner}', 'owner@example.test');
  `)
  const setup = await readFile(new URL('../supabase/admin_subscription_setup.sql', import.meta.url), 'utf8')
  await db.exec(setup)
  await db.exec(setup) // setup remains safe to rerun
  await query("select set_config('request.jwt.claim.sub', $1, false)", [admin])
  await db.exec('SET ROLE authenticated')

  let current = await details()
  assert.equal(current.last_renewal_date, null)
  const id = nextRequest()
  let granted = await extend(current.extension_until, id)
  assert.equal(granted.access_until, current.extension_until)
  assert.equal(granted.last_renewal_date, null, 'Sponsorship must not fabricate payment dates')
  assert.ok(granted.last_sponsored_at)
  assert.equal((await extend(current.extension_until, id)).access_until, granted.access_until, 'Retry grants only once')
  await assert.rejects(extend(current.extension_until), /Subscription changed/)
  await assert.rejects(query('select * from admin_private.trial_extensions'), /permission denied/)
  console.log('PASS new trial, audit, idempotent retry, stale preview, private audit access')

  await db.exec('RESET ROLE')
  await query(`update public.user_subscriptions set last_paid_date = '2028-01-01',
    next_billing_date = '2028-01-31', subscription_status = 'active', payfast_token = 'unchanged-token'
    where user_id = $1`, [owner])
  await db.exec('SET ROLE authenticated')
  current = await details()
  assert.equal(current.extension_until, '2028-02-29')
  granted = await extend(current.extension_until)
  assert.equal(granted.last_renewal_date, '2028-01-01')
  assert.equal(granted.access_until, '2028-02-29')
  await db.exec('RESET ROLE')
  let [row] = await query('select * from public.user_subscriptions where user_id = $1', [owner])
  assert.equal(row.payfast_token, 'unchanged-token')
  assert.equal(row.subscription_status, 'active')
  assert.equal(row.grace_period_end.toISOString().slice(0, 10), '2028-03-07')
  console.log('PASS leap-year month-end, payment preservation, billing token preservation, grace period')

  await query(`update public.user_subscriptions set next_billing_date = '2020-01-01',
    last_paid_date = '2019-12-01', subscription_status = 'cancelled' where user_id = $1`, [owner])
  const [{ expected }] = await query("select (((now() at time zone 'Africa/Johannesburg')::date + interval '1 month')::date)::text as expected")
  await db.exec('SET ROLE authenticated')
  current = await details()
  assert.equal(current.extension_until, expected)
  await extend(expected)
  await db.exec('RESET ROLE')
  ;[row] = await query('select * from public.user_subscriptions where user_id = $1', [owner])
  assert.equal(row.subscription_status, 'pending', 'Pending is supported by account access checks')
  console.log('PASS expired subscription restarts from today and restores eligible access status')

  await query('update public.user_subscriptions set user_id = null where user_id = $1', [owner])
  await db.exec('SET ROLE authenticated')
  current = await details()
  assert.equal(current.subscription_id, row.id)
  assert.equal((await extend(current.extension_until)).subscription_id, row.id)
  console.log('PASS legacy email lookup and extension without duplicate subscription')

  await query("select set_config('request.jwt.claim.sub', $1, false)", [owner])
  await assert.rejects(details(), /Administrator access required/)
  await assert.rejects(extend('2030-01-01'), /Administrator access required/)
  await db.exec('RESET ROLE; SET ROLE anon')
  await assert.rejects(details(), /permission denied/)
  await assert.rejects(extend('2030-01-01'), /permission denied/)
  console.log('PASS non-admin and anonymous read/write rejection')
} finally {
  await db.close()
}
