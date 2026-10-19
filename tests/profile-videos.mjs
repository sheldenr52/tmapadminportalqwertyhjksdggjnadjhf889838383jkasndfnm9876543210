import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'
import ts from 'typescript'

const source = await readFile(new URL('../src/youtube.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { youtubeId, youtubeEmbedUrl } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
for (const url of ['https://youtube.com/watch?v=M7lc1UVf-VE', 'https://youtu.be/M7lc1UVf-VE?si=test', 'https://www.youtube.com/shorts/M7lc1UVf-VE', 'https://m.youtube.com/live/M7lc1UVf-VE', 'https://youtube.com/embed/M7lc1UVf-VE']) assert.equal(youtubeId(url), 'M7lc1UVf-VE')
for (const url of ['https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad', 'https://evil.test/M7lc1UVf-VE', 'https://evil@youtube.com/watch?v=M7lc1UVf-VE']) assert.throws(() => youtubeId(url))
assert.equal(youtubeEmbedUrl('bad'), null)

const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema storage;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create table public.businesses (id uuid primary key);
    insert into businesses values ('00000000-0000-4000-8000-000000000001');
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
    create policy broad_existing_policy on storage.objects for all using (true) with check (true);
  `)
  const sql = await readFile(new URL('../supabase/profile_videos_setup.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // Setup can be safely rerun.
  const youtubeSql = await readFile(new URL('../supabase/profile_videos_youtube_setup.sql', import.meta.url), 'utf8')
  await db.exec(youtubeSql)
  await db.exec(youtubeSql)
  await db.exec(`set role authenticated; select set_config('test.admin', 'no', false)`)
  await assert.rejects(db.exec(`insert into profile_videos (storage_path) values ('bad.mp4')`), /row-level security/)
  await assert.rejects(db.exec(`insert into storage.objects values ('profile-videos','bad.mp4')`), /row-level security/)
  await db.exec(`select set_config('test.admin', 'yes', false)`)
  await db.exec(`insert into profile_videos (storage_path, business_id) values ('one.mp4','00000000-0000-4000-8000-000000000001')`)
  await db.exec(`insert into storage.objects values ('profile-videos','one.mp4')`)
  await db.exec(`insert into profile_videos (youtube_id) values ('M7lc1UVf-VE')`)
  await assert.rejects(db.exec(`insert into profile_videos (youtube_id) values ('invalid')`), /check constraint/)
  await assert.rejects(db.exec(`insert into profile_videos (storage_path, youtube_id) values ('both.mp4','M7lc1UVf-VE')`), /check constraint/)
  await assert.rejects(db.exec(`insert into profile_videos (caption) values ('No source')`), /check constraint/)
  await db.exec(`delete from profile_videos where youtube_id is not null`)
  await assert.rejects(db.exec(`insert into profile_videos (storage_path, business_id) values ('two.mp4','00000000-0000-4000-8000-000000000001')`), /unique constraint/)
  await assert.rejects(db.exec(`insert into profile_videos (storage_path, business_id) values ('missing.mp4','00000000-0000-4000-8000-000000000002')`), /foreign key/)
  await db.exec(`set role anon`)
  assert.equal((await db.query('select * from profile_videos')).rows.length, 1)
  await assert.rejects(db.exec(`delete from profile_videos`), /permission denied/)
  await db.exec(`set role authenticated; select set_config('test.admin', 'no', false)`)
  await db.exec(`update profile_videos set business_id=null; delete from profile_videos; delete from storage.objects where bucket_id='profile-videos'`)
  assert.equal((await db.query('select business_id from profile_videos')).rows[0].business_id, '00000000-0000-4000-8000-000000000001')
  await db.exec(`reset role`)
  assert.equal((await db.query("select * from storage.objects where bucket_id='profile-videos'")).rows.length, 1)
  console.log('Profile video permissions, public reads, unique links, foreign keys and rerunnable setup passed.')
} finally { await db.close() }
