# Home hero backend v1

## Banner analytics

Run `home_hero_analytics_setup.sql` as database owner after the public website's
`home_hero_events` table exists (UUID `slide_id`, `visitor_id`, text `event_type`,
timestamptz `created_at`). It preserves event ingestion and adds an admin-only
reporting RPC. The Home Hero Banners screen shows views, unique viewers, clicks,
unique clickers and unique CTR, including retained events for deleted banners.
Dates include both selected days in Africa/Johannesburg; the SQL upper timestamp
is exclusive. No-view CTR is undefined and displayed as a dash.

The live project denied connector access, so this script has not been applied
remotely. Verify locally with `node tests/home-hero-analytics.mjs`, then apply
the script in the project's SQL Editor and refresh statistics in the admin UI.

## Deployment

1. Apply `home_hero_setup.sql` once as database owner, after `admin_setup.sql`. The script is transactional and creates a new table; it is not intended to be rerun. Archive it in your deployment migration history as the home hero v1 migration. The Supabase CLI is not installed in this workspace, so no CLI migration history has been generated.
2. Deploy this admin portal, sign in with an existing trusted admin account, and open **Home Hero Banners**.
3. On the empty list, choose **Import original two banners**. The original assets are bundled under `public/hero-seed`. This uploads unique objects, checks that both public images load, and inserts both published rows in one database request. Success is reported only after the insert succeeds. Refresh before retrying an ambiguous network failure.
4. Switch the public website to the exact read contract in `HOME_HERO_BACKEND_HANDOFF.md` after verifying those rows. All field names match that contract. This admin repository does not contain the public `HeroCarousel` or its navigation implementation; those require a change in the public website repository.

## Verification

Run `npm run build` and `node tests/home-hero.mjs` (the latter uses the existing `.verification` PGlite dependency). Local SQL tests cover visitor and ordinary-user restrictions, drafts, unsafe destinations, missing images at publication, ordering validation, and storage write guards even with a broader existing policy.

After applying remotely, verify with an admin login that uploads, edits, publishing and reordering succeed. With public credentials, confirm only published rows are returned; with an ordinary account, confirm writes fail. Verify CTA service query strings and fragments on the public website after its integration is deployed. These live checks have not been run: the connected Supabase tool denied project access.

## Image lifecycle

Objects are immutable and replacements use new filenames. The database checks object existence on publication, and the admin additionally loads images to verify decoding. Public images are public even while their slide is a draft. All banner fields are optional. Empty text and desktop images are stored as empty strings; order defaults to 0. Supplied images and destinations are still validated. Render the public CTA only when both its label and URL are nonempty, and omit images with empty paths. For existing installations, apply `home_hero_optional_fields.sql` before deploying this form update; do not rerun the setup script.

Old objects and failed-save uploads are intentionally retained. Do not delete through SQL. A later cleanup job must use the Storage API and check both image columns across every slide. Storage DELETE policies reject referenced objects. UPDATE of home-hero objects is intentionally disabled; the app never uses upsert. Deleting a published row first unpublishes it, then deletes the row and retains its assets.

The last published slide requires an explicit confirmation before unpublishing or deletion. Reordering is a single transaction and rejects stale lists whose IDs no longer match. No server secret is shipped to the browser; all writes use the existing admin membership check through RLS.
