import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '../.verification/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function public.is_admin() returns boolean language sql as $$ select current_setting('test.admin', true) = 'yes' $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
    create policy broad_existing_policy on storage.objects for all using (true) with check (true);
  `)
  await db.exec(await readFile(new URL('../supabase/home_hero_setup.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../supabase/home_hero_optional_fields.sql', import.meta.url), 'utf8'))
  const path = 'slides/test/desktop-v1.webp'
  const row = `('00000000-0000-4000-8000-000000000001', ' Heading ', 'Caption', '${path}', 'Alt', 'Go', '/contact-us?service=advertise-home#contact-form')`
  await db.exec(`set role authenticated; select set_config('test.admin', 'no', false)`)
  await assert.rejects(db.exec(`insert into home_hero_slides (id,title,caption,image_path,image_alt,cta_label,cta_url) values ${row}`), /row-level security/)
  await assert.rejects(db.exec(`insert into storage.objects values ('home-hero', '${path}')`), /row-level security/)
  await assert.rejects(db.exec(`select reorder_home_hero_slides('{}')`), /Admin access/)
  await db.exec(`select set_config('test.admin', 'yes', false)`)
  await db.exec(`insert into home_hero_slides (id,title,caption,image_path,image_alt,cta_label,cta_url) values ${row}`)
  await assert.rejects(db.exec(`update home_hero_slides set is_active=true`), /Upload/)
  await db.exec(`insert into storage.objects values ('home-hero', '${path}')`)
  await db.exec(`update home_hero_slides set is_active=true`)
  assert.equal((await db.query('select title from home_hero_slides')).rows[0].title, 'Heading')
  for (const url of ['javascript:alert(1)', '//evil.com', '/\\evil.com', 'https://', 'https://user:pass@evil.com', 'https://bad host.com']) {
    const result = await db.query('select valid_home_hero_url($1) as valid', [url])
    assert.equal(result.rows[0].valid, false, url)
  }
  for (const url of ['/contact-us?service=website-design-hosting#contact-form', 'https://example.com/path?q=x#y']) {
    assert.equal((await db.query('select valid_home_hero_url($1) as valid', [url])).rows[0].valid, true)
  }
  await db.exec(`update home_hero_slides set title='  ', caption='', image_alt='', cta_label='', cta_url=''`)
  assert.equal((await db.query('select title from home_hero_slides')).rows[0].title, '')
  await assert.rejects(db.exec(`update home_hero_slides set cta_url='javascript:alert(1)'`), /check constraint/)
  await assert.rejects(db.exec(`update home_hero_slides set title=repeat('x',101)`), /check constraint/)
  await db.exec(`insert into home_hero_slides (is_active) values (true)`)
  assert.equal((await db.query("select image_path from home_hero_slides where id <> '00000000-0000-4000-8000-000000000001'")).rows[0].image_path, '')
  await db.exec("delete from home_hero_slides where id <> '00000000-0000-4000-8000-000000000001'")
  await assert.rejects(db.exec(`update home_hero_slides set sort_order=-1`), /check constraint/)
  await assert.rejects(db.exec(`select reorder_home_hero_slides('{}')`), /Slides changed/)
  await db.exec(`select reorder_home_hero_slides(array['00000000-0000-4000-8000-000000000001'::uuid])`)
  assert.equal((await db.query('select sort_order from home_hero_slides')).rows[0].sort_order, 10)
  assert.equal((await db.query(`delete from storage.objects where bucket_id='home-hero' returning *`)).rows.length, 0)
  await db.exec(`select set_config('test.admin', 'no', false); set role anon`)
  assert.equal((await db.query('select * from home_hero_slides')).rows.length, 1)
  await db.exec(`reset role; update home_hero_slides set is_active=false; set role anon`)
  assert.equal((await db.query('select * from home_hero_slides')).rows.length, 0)
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from home_hero_slides')).rows.length, 0)
  assert.equal((await db.query('delete from home_hero_slides returning *')).rows.length, 0)
  console.log('Home hero constraints, publishing, ordering, RLS and storage guards passed.')
} finally { await db.close() }
