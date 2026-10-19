# Demo profiles and client sharing

Implementation is ready locally. It is **not activated in production**: the
connected Supabase account denied access to project `bouxpfsfhetcqcrqflfk`.
No business phase or live database record was changed during development.

## Installation

1. In this project's Supabase SQL Editor, install `supabase/admin_setup.sql`
   if not already installed, then `supabase/admin_business_phase_setup.sql`,
   then `supabase/demo_profiles_setup.sql`. The last two scripts can be rerun.
2. Deploy `supabase/functions/business-demo` with gateway JWT verification off.
   The function performs its own authorization using the random demo token;
   clients do not need an account. With an authenticated Supabase CLI:

   ```powershell
   supabase functions deploy business-demo --project-ref bouxpfsfhetcqcrqflfk --no-verify-jwt
   ```

   The runtime uses the project's built-in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` secrets. Never put the service key in Vite envs.
3. Deploy this admin app and the public website at
   `../the_map/business-finder-react`. The public source changes filter
   `launch_phase = live` in the finder, featured strip and ordinary ID loader.
   The public website expects the phase column to exist before it is deployed.
   This adjacent folder has no configured Git repository. Its changes are also
   preserved in `public-site-demo-visibility.patch` in this repository; apply
   that patch from the public site's repository root if deploying elsewhere.
4. Refresh All Listings. The setup message must disappear.

Preview pages live on the **admin app's deployed domain**, at
`https://your-admin-domain/#demo/<random-token>`. They render before the admin
login flow and show only the requested client profile. The URL fragment keeps
the token out of normal hosting request paths and referrers. No server-side
SPA rewrite is needed for a fragment URL. Admin access is still required to
create, copy or revoke links and manage listings.

## Client workflow

1. Set a business to **Demo** and keep it **Active**.
2. Click **Copy demo link** in the Client preview column. The endpoint is
   checked before the app reports that a link is ready to share.
3. Click **Open preview** or paste the copied URL into a signed-out browser.
4. Send that URL to your client. Anyone holding it can open or forward it.
5. Use **Revoke link** to stop future requests through that link. Copy again
   to create a fresh link. Repeat copying preserves the current valid link.
6. Switching phase or changing Active status invalidates all older links.
   Returning to Demo/Active does not revive them. Generate a fresh link.

The page includes name, logo, description, categories, address, contact actions,
gallery photos and an optional promotional video. Older photo uploads stored
only in business folders are supported. Preview traffic is not added to the
public listing analytics. The demo marker is not an access policy by itself;
install the complete setup before sharing client previews.

## Privacy checks before production rollout

The SQL installs a restrictive business SELECT policy, preserving owners'
existing editor access and administrators' access. It restricts related
metadata tables discovered through single-column foreign keys to businesses.
This includes the known gallery, media/post and video tables. Existing
permissive public policies cannot override the restrictive policy. Related
tables without foreign keys, tables added after installation, and existing
views or privileged RPCs must be reviewed against the actual production
schema before declaring all public discovery paths protected. Rerunning the
setup picks up newly added foreign-key tables. Review security advisors too.

The service-only resolver returns an explicit profile field list and validates
token, current revision, phase and Active status together. Browsers cannot call
the resolver RPC directly. Token records are admin-only under RLS. Random
tokens contain two UUIDs' worth of entropy and are stored separately from
business records. No token is exposed in ordinary business SELECT responses.

This is link-only profile visibility, not confidential media storage. Existing
image/video buckets remain public: previously obtained asset URLs and any
external YouTube videos can still be opened directly. Previously indexed or
downloaded business content cannot be recalled. Preview pages request no
indexing, send no public analytics, and the endpoint uses `Cache-Control:
no-store`. Do not add demo links to sitemaps or public navigation.

Inspect production policies, foreign keys and views before installing:

```sql
SELECT tablename, policyname, cmd, permissive, roles, qual
FROM pg_policies WHERE schemaname = 'public';
SELECT conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.businesses'::regclass;
SELECT schemaname, viewname, definition FROM pg_views WHERE schemaname = 'public';
```

## Verification

```powershell
node tests/business-phase.mjs
node tests/demo-profiles.mjs
npm.cmd run build
```

The demo suite runs in an isolated PGlite database. It verifies anonymous and
unrelated-user denials (including direct IDs and linked metadata), owner editing,
admin-only tokens, service-only profile resolution, field whitelisting, legacy
photos, invalid tokens, phase changes, deactivation/reactivation, revocation,
safe HTTP responses and URL construction. Both application builds are checked.

Before sending a real client link, verify in a signed-out browser that the demo
appears only through its special URL, ordinary profile IDs return no demo,
public search/map/featured/gallery surfaces omit it, and Revoke link makes a
fresh request fail. Repeat with a normal owner account on the public finder.
Production verification remains pending until project access is available.
