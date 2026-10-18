-- Apply once to existing home hero installations as database owner.
begin;
alter table public.home_hero_slides alter column title set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_title_check;
alter table public.home_hero_slides add constraint home_hero_slides_title_check check (length(btrim(title)) <= 100);
alter table public.home_hero_slides alter column caption set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_caption_check;
alter table public.home_hero_slides add constraint home_hero_slides_caption_check check (length(btrim(caption)) <= 300);
alter table public.home_hero_slides alter column image_path set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_image_path_check;
alter table public.home_hero_slides add constraint home_hero_slides_image_path_check check (image_path = '' or image_path ~ '^slides/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(avif|webp|jpg|jpeg|png)$');
alter table public.home_hero_slides alter column image_alt set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_image_alt_check;
alter table public.home_hero_slides add constraint home_hero_slides_image_alt_check check (length(btrim(image_alt)) <= 160);
alter table public.home_hero_slides alter column cta_label set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_cta_label_check;
alter table public.home_hero_slides add constraint home_hero_slides_cta_label_check check (length(btrim(cta_label)) <= 40);
alter table public.home_hero_slides alter column cta_url set default '';
alter table public.home_hero_slides drop constraint home_hero_slides_cta_url_check;
alter table public.home_hero_slides add constraint home_hero_slides_cta_url_check check (cta_url = '' or public.valid_home_hero_url(cta_url));
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
commit;
