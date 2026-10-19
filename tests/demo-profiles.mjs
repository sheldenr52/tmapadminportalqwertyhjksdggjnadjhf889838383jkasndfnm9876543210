import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
const admin = '00000000-0000-4000-8000-000000000001'
const owner = '00000000-0000-4000-8000-000000000002'
const live = '10000000-0000-4000-8000-000000000001'
const demo = '10000000-0000-4000-8000-000000000002'
const file = path => readFile(new URL(path, import.meta.url), 'utf8')
const role = async (name, uid = '') => db.exec(`RESET ROLE; SET ROLE ${name}; SELECT set_config('request.jwt.claim.sub', '${uid}', false)`)
const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0]
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT auth.uid() = '${admin}'::uuid $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    CREATE TABLE businesses (
      id uuid PRIMARY KEY, owner_id uuid, name text, description text, address text,
      categories text[], lat double precision, lon double precision,
      logo_url text, contact_phone text, contact_email text, whatsapp_number text, website_url text,
      is_active boolean NOT NULL DEFAULT true
    );
    INSERT INTO businesses (id, owner_id, name) VALUES ('${live}', '${owner}', 'Live'), ('${demo}', '${owner}', 'Client draft');
    CREATE POLICY old_public_read ON businesses FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY owner_write ON businesses FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.is_admin()) WITH CHECK (owner_id = auth.uid() OR public.is_admin());
    GRANT SELECT ON businesses TO anon;
    GRANT SELECT, UPDATE, INSERT ON businesses TO authenticated, service_role;
    CREATE TABLE picture_gallery (id int, business_id uuid REFERENCES businesses(id), caption text);
    CREATE TABLE business_media_and_posts (id int, business_id uuid REFERENCES businesses(id), photo_url text, media_type text, created_at timestamptz DEFAULT now());
    CREATE TABLE profile_videos (business_id uuid REFERENCES businesses(id), storage_path text, youtube_id text, caption text);
    CREATE TABLE storage.objects (bucket_id text, name text);
    INSERT INTO picture_gallery VALUES (1, '${live}', 'Live photo'), (2, '${demo}', 'Draft photo'), (3, null, 'General');
    INSERT INTO business_media_and_posts VALUES (1, '${demo}', 'https://example.com/draft.jpg', 'photo', now());
    INSERT INTO profile_videos VALUES ('${demo}', null, 'dQw4w9WgXcQ', 'Draft video');
    CREATE POLICY old_public_read ON picture_gallery FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY old_public_read ON business_media_and_posts FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY old_public_read ON profile_videos FOR SELECT TO anon, authenticated USING (true);
    GRANT SELECT ON picture_gallery, business_media_and_posts, profile_videos TO anon, authenticated, service_role;
    GRANT SELECT ON storage.objects TO service_role;
  `)
  await db.exec(await file('../supabase/admin_business_phase_setup.sql'))
  await db.exec(await file('../supabase/demo_profiles_setup.sql'))
  await db.exec(await file('../supabase/demo_profiles_setup.sql'))
  await role('authenticated', admin)
  await db.exec(`UPDATE businesses SET launch_phase = 'demo' WHERE id = '${demo}'`)
  await db.exec(`INSERT INTO business_demo_links (business_id, demo_revision) SELECT id, demo_revision FROM businesses WHERE id = '${demo}'`)
  const token = await scalar('SELECT token FROM business_demo_links')
  assert.match(token, /^[a-f0-9]{64}$/)
  await role('anon')
  assert.deepEqual((await db.query('SELECT name FROM businesses')).rows, [{ name: 'Live' }])
  assert.equal((await db.query(`SELECT * FROM businesses WHERE id = '${demo}'`)).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM picture_gallery')).rows.length, 2)
  assert.equal((await db.query('SELECT * FROM business_media_and_posts')).rows.length, 0)
  assert.equal((await db.query('SELECT * FROM profile_videos')).rows.length, 0)
  await assert.rejects(db.query('SELECT token FROM business_demo_links'), /permission denied/)
  await assert.rejects(db.query(`SELECT resolve_business_demo('${token}')`), /permission denied/)
  await role('authenticated', '00000000-0000-4000-8000-000000000003')
  assert.equal((await db.query('SELECT * FROM businesses')).rows.length, 1)
  assert.equal((await db.query('SELECT token FROM business_demo_links')).rows.length, 0)
  await assert.rejects(db.exec(`INSERT INTO business_demo_links (business_id, demo_revision) VALUES ('${live}', gen_random_uuid())`), /row-level security/)
  await role('authenticated', owner)
  assert.equal((await db.query('SELECT * FROM businesses')).rows.length, 2)
  await db.exec(`UPDATE businesses SET description = 'Owner may edit' WHERE id = '${demo}'`)
  await assert.rejects(db.exec(`UPDATE businesses SET launch_phase = 'live' WHERE id = '${demo}'`), /Only administrators/)
  await role('service_role')
  const result = await scalar(`SELECT resolve_business_demo('${token}')`)
  assert.equal(result.business.name, 'Client draft')
  assert.equal(result.business.description, 'Owner may edit')
  assert.equal(result.business.owner_id, undefined)
  assert.equal(result.business.id, undefined)
  assert.equal(result.photos.length, 1)
  assert.equal(result.video.youtube_id, 'dQw4w9WgXcQ')
  await db.exec('RESET ROLE')
  await db.exec(`DELETE FROM business_media_and_posts;
    INSERT INTO storage.objects VALUES ('business-images', 'uploader/${demo}/legacy.jpg'),
      ('business-images', 'uploader/${live}/other.jpg'), ('business-images', 'uploader/${demo}/not-an-image.txt');`)
  await role('service_role')
  assert.deepEqual((await scalar(`SELECT resolve_business_demo('${token}')`)).image_paths, [`uploader/${demo}/legacy.jpg`])
  assert.equal(await scalar(`SELECT resolve_business_demo('${'a'.repeat(64)}')`), null)
  await role('authenticated', owner)
  const oldRevision = await scalar(`SELECT demo_revision FROM businesses WHERE id = '${demo}'`)
  await db.exec(`UPDATE businesses SET is_active = false WHERE id = '${demo}'`)
  await role('service_role')
  assert.equal(await scalar(`SELECT resolve_business_demo('${token}')`), null)
  await role('authenticated', owner)
  await db.exec(`UPDATE businesses SET is_active = true, demo_revision = '${oldRevision}' WHERE id = '${demo}'`)
  assert.notEqual(await scalar(`SELECT demo_revision FROM businesses WHERE id = '${demo}'`), oldRevision)
  await role('service_role')
  assert.equal(await scalar(`SELECT resolve_business_demo('${token}')`), null, 'Old token must not revive after owner reactivation')
  await role('authenticated', admin)
  await db.exec(`DELETE FROM business_demo_links; INSERT INTO business_demo_links (business_id, demo_revision) SELECT id, demo_revision FROM businesses WHERE id = '${demo}'`)
  const newToken = await scalar('SELECT token FROM business_demo_links')
  assert.notEqual(token, newToken)
  await role('service_role')
  assert.ok(await scalar(`SELECT resolve_business_demo('${newToken}')`))
  await role('authenticated', admin)
  await db.exec(`UPDATE businesses SET launch_phase = 'live' WHERE id = '${demo}'`)
  await role('service_role')
  assert.equal(await scalar(`SELECT resolve_business_demo('${newToken}')`), null)
  await role('authenticated', admin)
  await db.exec(`UPDATE businesses SET launch_phase = 'demo' WHERE id = '${demo}'`)
  await role('service_role')
  assert.equal(await scalar(`SELECT resolve_business_demo('${newToken}')`), null, 'Old links cannot revive after switching back to Demo')
  await role('authenticated', admin)
  await db.exec('DELETE FROM business_demo_links')
  assert.equal((await db.query('SELECT token FROM business_demo_links')).rows.length, 0)
  console.log('Demo database checks passed: anonymous/direct-ID/related-data privacy, owner edits, admin-only tokens, service-only resolution, whitelist, phase changes, revocation and non-resurrection.')
} finally { await db.close() }

const importTs = async path => {
  const compiled = ts.transpileModule(await file(path), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
}
const { createDemoHandler } = await importTs('../supabase/functions/business-demo/handler.ts')
let calls = 0
const handle = createDemoHandler(async token => { calls++; return token === 'a'.repeat(64) ? { business: { name: 'Preview' } } : null })
const request = body => new Request('https://example.com/business-demo', { method: 'POST', body: JSON.stringify(body) })
assert.equal((await handle(new Request('https://example.com'))).status, 405)
assert.equal((await handle(new Request('https://example.com', { method: 'OPTIONS' }))).status, 204)
assert.equal((await handle(request({ token: 'business-id' }))).status, 404)
assert.equal(calls, 0)
assert.equal((await handle(request({ token: 'b'.repeat(64) }))).status, 404)
const response = await handle(request({ token: 'a'.repeat(64) }))
assert.equal(response.status, 200)
assert.equal(response.headers.get('Cache-Control'), 'no-store')
assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive')
assert.equal((await response.json()).business.name, 'Preview')
assert.equal((await handle(new Request('https://example.com', { method: 'POST', body: '{broken' }))).status, 400)
const broken = createDemoHandler(async () => { throw new Error('secret database detail') })
const failed = await broken(request({ token: 'a'.repeat(64) }))
assert.equal(failed.status, 503)
assert.ok(!(await failed.text()).includes('secret'))
const { demoProfileUrl, safeWebUrl } = await importTs('../src/demoLinks.ts')
assert.equal(demoProfileUrl('a'.repeat(64), 'https://admin.example.com/?session=remove'), `https://admin.example.com/#demo/${'a'.repeat(64)}`)
assert.throws(() => demoProfileUrl('bad', 'https://example.com'))
assert.equal(safeWebUrl('javascript:alert(1)'), undefined)
assert.equal(safeWebUrl('example.com'), 'https://example.com/')
console.log('Demo HTTP and link checks passed: token validation, missing/revoked response, no cache, no indexing, safe errors, URL fragment, and safe external URLs.')
