User editing: All Users now includes **Edit details** for email and names.
Deploy the `admin-update-user` Edge Function before saving edits.
See `../USER_EDIT_SETUP.md` for deployment and verification instructions.

Listing analytics: install `listing_analytics_setup.sql` after `admin_setup.sql`.
Follow `../LISTING_ANALYTICS_IMPLEMENTATION.md` for the public website tracking
helper and exact integration points. The admin All Listings screen now has a
Stats button for each business, with date filters, unique browser counts,
action counts, entry points, and daily activity. The SQL is tested locally;
the connected Supabase account denied production access, so it is not installed
remotely. Public website changes must also be deployed before data can appear.
Verify with `node tests/listing-analytics.mjs`,
`node tests/listing-tracker.mjs`, and `npm.cmd run build`.

Featured businesses: install `admin_featured_setup.sql` after `admin_setup.sql`.
It adds `businesses.is_featured` (default off) and protects changes with the
existing `is_admin()` helper while preserving existing listing RLS policies.
The All Listings Featured switch saves immediately. Existing listings remain
available before installation, with featured switches disabled.
Deploy the public application's FeaturedCarousel change alongside the admin app;
it selects only active, featured businesses (up to 20, ordered by name and ID).
The strip hides when none are selected. Refresh the public page after changes.
No businesses are automatically selected. Database access was denied by the
connected Supabase account, so this setup has not been installed remotely.
Local database verification: `node tests/featured.mjs`.

To clear all existing featured selections, run `reset_featured_businesses.sql`
once in the Supabase SQL Editor after the featured setup. Its verification count
must return zero. Businesses remain unfeatured until an admin enables their
Featured switch. This reset has been tested locally but not applied remotely
because project access is denied. Do not rerun it after making selections unless
you want to clear them again.

The renewal and trial controls in All Listings and All Users use the account's
`user_subscriptions` record. Install `admin_subscription_setup.sql` in the
Supabase SQL Editor after the existing admin setup. The connected project denied
database access during development, so this setup has not been applied remotely.

The setup follows the subscription schema in the adjacent user application.
Verify that schema against the live project before applying it. It adds two
admin-only RPCs and a private audit table. Keep `admin_private` out of the exposed
API schemas. No existing subscription is changed by running the setup.

The UI displays the most recent recorded payment as the last renewal and shows
the last sponsorship separately. A free month extends the current access date,
or starts today if expired, using a calendar month in Africa/Johannesburg time.
Month-end dates clamp to the last day of the following month. The existing
seven-day grace period remains. Repeated delivery of a request grants only once;
a changed expiry requires the admin to refresh and review it again.

Sponsorship applies to the owner's account and all its listings. It updates the
access expiry used by the current user application, retains payment dates and
PayFast tokens, and logs the admin and before/after dates. It does not call PayFast
or postpone recurring charges. The existing payment webhook can replace the
access expiry when another payment arrives. New trials have no payment date;
the current user application allows access for their `pending` status and future
expiry, but its payment message may still report no recent payment.

Local verification (isolated PostgreSQL; no production data):

```powershell
npm.cmd install --prefix .verification --no-save --package-lock=false @electric-sql/pglite@0.5.8
node tests/subscriptions.mjs
npm.cmd run build
```

After installation, sign in as an admin and verify that dates load. Exercise an
extension on a test account, refresh both admin and user applications, and check
that access is enabled and the payment date is unchanged. Live permissions and
triggers still need this integration check.
