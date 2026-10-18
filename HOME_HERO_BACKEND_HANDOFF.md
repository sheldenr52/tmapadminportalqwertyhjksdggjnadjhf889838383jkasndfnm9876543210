# Home page hero banner: backend handoff

## Goal

Make the home page hero carousel editable from the admin backend, using the same Supabase-driven approach as the featured client/business carousel. Each slide may include a Supabase-hosted image, heading, caption, and CTA button with an editable label and destination. All banner form fields are optional. Admins must be able to add, edit, reorder, publish, unpublish, and delete slides without a frontend deployment.

This document is an implementation specification. The database, admin screens, storage bucket, and frontend integration described below have not been created by this handoff.

## Existing frontend

- `src/components/index.tsx`: `HeroCarousel` currently contains two hardcoded slides, using `/themap-home-image.avif` and `/Advertise.webp`. It rotates every seven seconds and has arrows and slide indicators.
- Each slide has a `title` and `subtitle`. The new `caption` field replaces `subtitle`; keep the heading and caption below the image in the current layout.
- The CTA currently says **Get Started** and selects a contact service using the slide's array index. Replace this with each slide's saved CTA label and URL. Reordering slides must never change their CTA destination.
- `src/components/FeaturedCarousel.tsx` already fetches active featured rows from Supabase's `businesses` table. Follow that direct-read pattern, but use a separate hero table.
- Reuse the project's client in `src/supabaseClient.ts` and the same Supabase project (`bouxpfsfhetcqcrqflfk`).

## Data contract

Create `public.home_hero_slides`, with one row per slide:

| Field | Type / default | Requirement |
| --- | --- | --- |
| `id` | UUID, generated | Stable primary key; use as the React key. |
| `title` | text | Optional heading, up to 100 characters after trimming. |
| `caption` | text | Optional plain-text caption, up to 300 characters after trimming. |
| `image_path` | text | Optional object path (empty string when omitted) inside `home-hero`, e.g. `slides/<uuid>/desktop-<version>.webp`; store the path, not a signed URL. |
| `mobile_image_path` | nullable text | Optional mobile image in the same bucket; otherwise use `image_path`. |
| `image_alt` | text | Optional image description, up to 160 characters. |
| `cta_label` | text | Optional button label, up to 40 characters. |
| `cta_url` | text | Optional site-relative path or absolute HTTPS URL, up to 2,048 characters. |
| `cta_new_tab` | boolean, `false` | Admin choice for external links. Internal links open in the same tab. |
| `sort_order` | integer, `0` | Nonnegative; lowest value appears first. Use `id` as a tie-breaker. |
| `is_active` | boolean, `false` | New slides are drafts until published. |
| `created_at` | timestamptz, `now()` | Creation timestamp. |
| `updated_at` | timestamptz, `now()` | Set by the database on every update. |

Allow blank text and omitted images in both the database and admin form. Retain maximum lengths and nonnegative ordering. Publishing must verify any supplied image objects exist and can be loaded. Existing installations must apply `supabase/home_hero_optional_fields.sql`. Text and desktop image fields default to empty strings.

Validate CTA URLs on both write and render: accept paths starting with a single `/` (reject `//` and backslashes) or absolute `https://` URLs with a valid host. Reject `javascript:`, `data:`, and other schemes. Preserve query strings and hash fragments.

Example row (the object must actually be uploaded before publishing):

```json
{
  "id": "01e1a108-7c83-4f3d-9abc-7a62ae8c6335",
  "title": "Advertise with The Map",
  "caption": "Promote your business to a local audience across South Africa.",
  "image_path": "slides/01e1a108-7c83-4f3d-9abc-7a62ae8c6335/desktop-v1.webp",
  "mobile_image_path": null,
  "image_alt": "Advertise your business with The Map",
  "cta_label": "Get Started",
  "cta_url": "/contact-us?service=advertise-home#contact-form",
  "cta_new_tab": false,
  "sort_order": 20,
  "is_active": true
}
```

## Supabase Storage

Create a **public** bucket named `home-hero`. These are public marketing images. Public bucket URLs allow visitors to load images without login; uploads and deletion still need authorized access. See [Supabase bucket access models](https://supabase.com/docs/guides/storage/buckets/fundamentals).

- Set a recommended maximum upload size of 5 MB and allow only `image/avif`, `image/webp`, `image/jpeg`, and `image/png`. Validate actual image contents as well as MIME type in the upload flow.
- Recommend a consistent desktop aspect ratio around 16:9, at least 1,600 px wide. Offer an optional mobile crop and a desktop/mobile preview; the current frontend uses `object-fit: cover`.
- Use unique, versioned filenames for replacement images to avoid stale cached content.
- Upload a new image first, verify it, then save its path on the row. Keep the old image if the row save fails. Clean up failed uploads and unreferenced old images later; never delete an image still used by another row.
- Store only bucket-relative object paths in the table. Resolve them with `supabase.storage.from('home-hero').getPublicUrl(path).data.publicUrl`. This resolves a URL; it does not check that the file exists.
- Public storage means unpublished images can still be accessed by anyone who has their URL. If confidential previews are needed later, use a separate private staging bucket.

## Admin access and publishing

Reuse the admin portal's existing trusted admin authorization. Enable RLS on `home_hero_slides`, grant public SELECT access for the Data API, and allow `anon` and `authenticated` visitors to read **only** rows where `is_active = true`. Authorized admins need SELECT access to drafts plus INSERT, UPDATE, and DELETE access.

Do not authorize writes merely because a user is logged in. Use the existing server-controlled admin role or membership check; never use user-editable `user_metadata`. For UPDATE policies, include both `USING` and `WITH CHECK`. Inspect existing policies so a broader policy cannot expose drafts or allow unintended writes.

For uploads through an authenticated admin client, restrict Storage policies on `storage.objects` to the `home-hero` bucket and authorized admins. File replacement using upsert needs INSERT, SELECT, and UPDATE permission; deletion needs DELETE. See [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

If the admin backend instead uses a server-side secret/service-role key, perform the admin authorization check on every operation because that key bypasses RLS. Never place that key in the public website or browser admin bundle.

Add a **Home Hero Banners** admin screen with:

1. A slide list showing thumbnails, titles, status, and order.
2. Create/edit form for desktop image, optional mobile image, alt text, heading, caption, CTA label, CTA URL, and new-tab choice.
3. Desktop/mobile previews showing the image, caption, and clickable CTA layout.
4. Publish/unpublish controls, reorder controls, and a delete action with confirmation.
5. Clear save/upload errors; only show success after the database write succeeds.

Save reorder changes atomically so partial failures do not leave an unintended order. Deactivate a published slide before deleting its files. Keep at least one active slide unless the admin intentionally wants the hero hidden.

## Frontend integration contract

Fetch using the existing Supabase client:

```ts
const { data, error } = await supabase
  .from('home_hero_slides')
  .select('id,title,caption,image_path,mobile_image_path,image_alt,cta_label,cta_url,cta_new_tab,sort_order')
  .eq('is_active', true)
  .order('sort_order', { ascending: true })
  .order('id', { ascending: true });
```

- Map `image_path` to the image URL, `image_alt` to alt text, `title` to the heading, and `caption` to the paragraph. Use `mobile_image_path` at the existing mobile breakpoint (768 px) when provided.
- Render caption and heading as plain text, never admin-provided HTML.
- Omit empty headings, captions and images. Render the CTA only when both its label and destination are present, using `cta_label` and `cta_url`. Internal destinations must update the existing app navigation state correctly and preserve service query parameters and the `#contact-form` fragment. Simply changing browser history without notifying the app is insufficient. External new-tab links should use `rel="noopener noreferrer"`.
- Remove the index-based service selection and adapt or replace the existing `onGetStarted` callback so any valid configured destination works.
- Preserve the seven-second rotation, arrows, dots, responsive layout, and styles. With one slide, disable rotation and hide carousel navigation. Reset/clamp the active slide when the result changes; never perform modulo zero.
- While loading, use a stable placeholder. On a failed request, retain the last successfully loaded slides, or use the current local slides on a first-load failure. On a successful empty result, hide the hero; do not resurrect unpublished slides through a fallback.
- Handle broken image URLs once with a local fallback; avoid an infinite image error loop. If the mobile image fails, try the desktop image first.
- Fetch on home-page mount. Admin updates must appear on the next page load without a deployment. Live updates on already-open pages can be added later using refetching or Realtime; they are not required for this initial scope.

## Initial content migration

Upload the two existing assets from `public/` to `home-hero`, then create the following rows with their actual storage paths:

| Order | Heading | Caption | CTA label | CTA destination |
| --- | --- | --- | --- | --- |
| 10 | Welcome to themap.co.za | Empowering South African businesses online with modern websites, business listings, advertising, and more. | Get Started | `/contact-us?service=website-design-hosting#contact-form` |
| 20 | Advertise with The Map | Promote your business to a local audience across South Africa. | Get Started | `/contact-us?service=advertise-home#contact-form` |

Publish after uploads are verified. Coordinate the table/bucket setup and frontend switch so visitors retain a working hero during rollout.

## Acceptance checks and delivery

- An admin can upload an image, set heading/caption/CTA, publish, and see it on the home page after refreshing without redeploying.
- Editing content and replacing images works; reorder keeps each CTA paired with its slide.
- CTA links preserve the existing contact form service selection; external HTTPS destinations work.
- Drafts/unpublished rows cannot be read using the website's public credentials. Visitors and ordinary authenticated users cannot write rows or upload/delete images.
- One slide, several slides, no active slides, a network failure, and a broken image render safely on desktop and mobile.
- Oversized uploads, invalid file types, blank content, and unsafe CTA URLs are rejected.

Backend developer to deliver: a versioned database migration with constraints/RLS, configured storage bucket and admin policies, admin CRUD/upload/reordering screens, the two migrated initial slides, and confirmation of the field names above. Frontend developer to deliver: the Supabase read integration and per-slide CTA/caption rendering in `HeroCarousel`. Agree on any field-name changes before implementing either side.
