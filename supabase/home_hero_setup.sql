-- Home hero v1. Requires existing public.is_admin() backed by admin_users.
-- Apply as database owner. No seed is published until real images are uploaded.
begin;
create schema if not exists private;
revoke all on schema private from public;

create or replace function public.valid_home_hero_url(value text)
returns boolean language sql immutable set search_path = '' as $$
  select length(value) between 1 and 2048
    and value !~ '[[:space:][:cntrl:]\\]'
    and (value ~ '^/([^/]|$)' or value ~ '^https://([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)*[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#]|$)');
$$;

create table public.home_hero_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (length(btrim(title)) <= 100),
  caption text not null default '' check (length(btrim(caption)) <= 300),
  image_path text not null default '' check (image_path = '' or image_path ~ '^slides/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(avif|webp|jpg|jpeg|png)$'),
  mobile_image_path text check (mobile_image_path ~ '^slides/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(avif|webp|jpg|jpeg|png)$'),
  image_alt text not null default '' check (length(btrim(image_alt)) <= 160),
  cta_label text not null default '' check (length(btrim(cta_label)) <= 40),
  cta_url text not null default '' check (cta_url = '' or public.valid_home_hero_url(cta_url)),
  cta_new_tab boolean not null default false check (not cta_new_tab or cta_url like 'https://%'),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index home_hero_order on public.home_hero_slides (sort_order, id) where is_active;
alter table public.home_hero_slides enable row level security;
revoke all on public.home_hero_slides from anon, authenticated;
grant select on public.home_hero_slides to anon, authenticated;
grant insert, update, delete on public.home_hero_slides to authenticated;
create policy hero_read on public.home_hero_slides for select to anon, authenticated
  using (is_active or public.is_admin());
create policy hero_write on public.home_hero_slides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home-hero', 'home-hero', true, 5242880, array['image/avif','image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy hero_storage_admin on storage.objects for all to authenticated
  using (bucket_id = 'home-hero' and public.is_admin())
  with check (bucket_id = 'home-hero' and public.is_admin());
-- Restrictive guards prevent existing broad Storage policies from authorizing hero writes.
create policy hero_storage_insert_guard on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'home-hero' or public.is_admin());
create policy hero_storage_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'home-hero') with check (bucket_id <> 'home-hero');
-- Immutable versioned objects are intentionally not overwritten.
create or replace function public.home_hero_image_referenced(path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.home_hero_slides where image_path = path or mobile_image_path = path);
$$;
revoke all on function public.home_hero_image_referenced(text) from public;
grant execute on function public.home_hero_image_referenced(text) to anon, authenticated;
create policy hero_storage_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id <> 'home-hero' or (public.is_admin() and not public.home_hero_image_referenced(name)));

create or replace function private.check_home_hero_slide()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := btrim(new.title); new.caption := btrim(new.caption);
  new.image_alt := btrim(new.image_alt); new.cta_label := btrim(new.cta_label);
  new.updated_at := now();
  if new.is_active and (
    (new.image_path <> '' and not exists (select 1 from storage.objects where bucket_id = 'home-hero' and name = new.image_path))
    or (new.mobile_image_path is not null and not exists (
      select 1 from storage.objects where bucket_id = 'home-hero' and name = new.mobile_image_path
    ))
  ) then raise exception 'Upload the selected images before publishing'; end if;
  return new;
end;
$$;
revoke all on function private.check_home_hero_slide() from public;
create trigger check_home_hero_slide before insert or update on public.home_hero_slides
  for each row execute function private.check_home_hero_slide();

create or replace function public.reorder_home_hero_slides(slide_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  lock table public.home_hero_slides in share row exclusive mode;
  if cardinality(slide_ids) is null
    or cardinality(slide_ids) <> (select count(*) from public.home_hero_slides)
    or (select count(distinct id) from unnest(slide_ids) as ids(id)) <> cardinality(slide_ids)
    or exists (select 1 from unnest(slide_ids) as ids(id) where id is null or not exists (select 1 from public.home_hero_slides s where s.id = ids.id))
  then raise exception 'Slides changed. Refresh before reordering.'; end if;
  update public.home_hero_slides s set sort_order = ids.position::integer * 10
  from unnest(slide_ids) with ordinality as ids(id, position) where s.id = ids.id;
end;
$$;
revoke all on function public.reorder_home_hero_slides(uuid[]) from public;
grant execute on function public.reorder_home_hero_slides(uuid[]) to authenticated;
commit;
