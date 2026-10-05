# Featured businesses: changes to apply to the original projects

## Result

Every business starts with Featured off. An admin can turn Featured on or off in All Listings, and the change saves immediately. The public strip shows only businesses where both `is_active` and `is_featured` are true. It hides when there are no matching businesses.

The public strip still shows at most 20 businesses, ordered by name and then ID. Refresh the public page after changing a selection; this implementation does not subscribe to live updates.

## Why businesses were still showing on the live website

The JavaScript served by `https://themap.co.za/businesses` was inspected. Its featured query only filtered by `is_active`, so it displayed ordinary active listings regardless of Featured status. The corrected source had not been included in the deployed build.

Changing the database alone will not fix a deployed website that still uses that old query. Apply the public-site change below, rebuild, and deploy the generated files.

## 1. Public website: filter the featured strip

File: `business-finder-react/src/components/FeaturedCarousel.tsx` in the public website project.

Find this query inside `fetchFeatured`:

```tsx
const { data, error } = await supabase
  .from('businesses')
  .select('id, name, categories, description, address, contact_phone, logo_url')
  .eq('is_active', true)
  .limit(20);
```

Replace it with:

```tsx
const { data, error } = await supabase
  .from('businesses')
  .select('id, name, categories, description, address, contact_phone, logo_url')
  .eq('is_active', true)
  .eq('is_featured', true)
  .order('name', { ascending: true })
  .order('id', { ascending: true })
  .limit(20);
```

Keep the existing empty-state behavior:

```tsx
if (loading || businesses.length === 0) return null;
```

Do not fall back to all active businesses when no featured businesses are found. If the database column has not been installed, this query fails and the current component keeps the strip hidden.

## 2. Admin project: include the featured field

File: `src/supabase.ts` in the admin project.

Add this property to the existing `Business` interface immediately after `is_active`:

```ts
is_featured?: boolean
```

The property is optional so the admin can still display listings before the database setup is installed. A missing property disables the Featured switch.

## 3. Admin project: add the Featured toggle

File: `src/components/admin/AdminBusinessList.tsx`.

Add these state declarations inside `AdminBusinessList` alongside the existing state:

```tsx
const [savingFeatured, setSavingFeatured] = useState<Set<string>>(new Set())
const [featuredError, setFeaturedError] = useState<string | null>(null)
```

In `fetchBusinesses`, replace the explicit field list passed to `.select(...)` with:

```tsx
.select('*', { count: 'exact' })
```

Keep the existing ordering, pagination, search, and status filters. Selecting all fields includes `is_featured` once installed without making listing retrieval fail before installation.

Add this handler inside the component, before its `return`:

```tsx
const handleToggleFeatured = async (biz: Business) => {
  if (savingFeatured.has(biz.id)) return
  setSavingFeatured(prev => new Set(prev).add(biz.id))
  setFeaturedError(null)
  try {
    const { data, error: updateError } = await supabase
      .from('businesses')
      .update({ is_featured: !biz.is_featured, updated_at: new Date().toISOString() })
      .eq('id', biz.id)
      .select('id, is_featured')
      .single()
    if (updateError) throw updateError
    setBusinesses(prev => prev.map(b => b.id === data.id ? { ...b, is_featured: data.is_featured } : b))
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message
    setFeaturedError(`Could not update featured status for ${biz.name}: ${message || 'Please try again.'}`)
  } finally {
    setSavingFeatured(prev => {
      const next = new Set(prev)
      next.delete(biz.id)
      return next
    })
  }
}
```

This waits for a confirmed saved row before updating the displayed switch. Failed or denied updates leave the previous value visible.

Below the existing listing error message and above the loading/table conditional, add:

```tsx
<p style={{ margin: '1rem', color: 'var(--gray-600)', fontSize: '0.875rem' }}>
  Turn Featured on to include a business in the featured strip. Only active businesses appear. Changes save automatically.
</p>
{featuredError && <div role="alert" className="alert alert-error" style={{ margin: '1rem' }}>{featuredError}</div>}
{businesses.some(b => b.is_featured === undefined) && (
  <div role="status" className="alert alert-error" style={{ margin: '1rem' }}>
    Featured controls need the database setup installed before they can be used.
  </div>
)}
```

Add a table header immediately after `<th>Status</th>`:

```tsx
<th>Featured</th>
```

Inside `businesses.map(biz => ...)`, insert this cell immediately after the Status cell and before the Created cell:

```tsx
<td>
  <label className="toggle-switch" title="Include this business in the featured strip">
    <input
      type="checkbox"
      role="switch"
      aria-label={`Feature ${biz.name}`}
      checked={biz.is_featured === true}
      disabled={savingFeatured.has(biz.id) || biz.is_featured === undefined}
      onChange={() => handleToggleFeatured(biz)}
    />
    <div className="toggle-track"><div className="toggle-thumb" /></div>
    <span style={{ fontSize: '0.78rem' }}>
      {savingFeatured.has(biz.id) ? 'Saving...' : biz.is_featured ? 'Featured' : 'Off'}
    </span>
  </label>
</td>
```

The toggle is in All Listings. No Featured field was added to the create or edit forms. Creating a business relies on the database default of false.

## 4. Admin project: keyboard-accessible switch styling

File: `src/index.css`.

Replace `.toggle-switch input { display: none; }` with:

```css
.toggle-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.toggle-switch input:focus-visible + .toggle-track {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

.toggle-switch input:disabled + .toggle-track {
  opacity: 0.5;
  cursor: wait;
}
```

Keep the existing `.toggle-track`, `.toggle-thumb`, and checked-state styles. These shared styles also make the existing switches keyboard-focusable.

## 5. Database setup

Run the SQL in Appendix A in the correct project's Supabase SQL Editor, after the existing `admin_setup.sql`.

Prerequisites: the existing `public.businesses` table, `public.is_admin()` helper, and existing admin SELECT/UPDATE policies. This setup preserves those policies; it does not grant broader access to listings. The trigger prevents non-admins from changing Featured, including setting it during an insert, while allowing ordinary listing edits.

The new column defaults to false. If it is newly added, all existing businesses start unfeatured. If the column already exists with featured selections, use the reset in Appendix B to clear them.

## 6. Clear all existing featured selections once

After Appendix A, run Appendix B in the Supabase SQL Editor. It clears every business's featured flag and explicitly sets the default to false for new businesses. The result `featured_businesses_remaining` must be `0`.

This is a one-time administrative reset. Do not run it on page load or on every deployment, because rerunning it would erase the businesses you manually selected afterward. It temporarily disables only the featured guard inside a locked transaction and restores it before committing.

## 7. Build, deploy, and verify

1. Install Appendix A, then run Appendix B once.
2. Apply the public-site and admin changes above in their respective original projects.
3. Run `npm run build` in each app directory.
4. Deploy each app's generated `dist` contents to its corresponding hosting location. For the public site, replace `index.html` and upload its matching `assets` files together. Editing source files alone does not update the hosted website.
5. Refresh `/businesses`. With zero featured businesses, the strip should be hidden.
6. Sign into the admin app and enable Featured on one active business. Refresh the public page and confirm that only that business appears (the carousel duplicates cards for its scrolling animation).
7. Turn Featured off and refresh again; the strip should disappear.
8. Confirm an inactive business does not appear even if its Featured switch is on.
9. Create a new listing and confirm its Featured switch starts off.

If the old strip remains after deployment, inspect the JavaScript file referenced by the live page's `index.html`. The featured query must contain a filter for `is_featured`, as well as `is_active`. Ensure the new HTML and its matching assets were uploaded, then clear any hosting/CDN cache if it still serves the old files.

## Verification and live status when this guide was created

The admin production build and public website production build passed. Local PostgreSQL tests passed for defaults, admin changes, rejection of non-admin featured changes, ordinary owner edits, active-only selection, clearing all selections, restoring the guard, and manually featuring a business after the reset.

The public build reported existing bundle-size and `lottie-web` eval warnings. The build completed successfully.

The database setup and reset were **not applied to production** because the connected Supabase account denied access. The corrected public build was produced locally; a production upload was not performed. This guide includes everything needed to apply the feature without relying on the generated ZIP.


## Appendix A: admin_featured_setup.sql

```sql
-- Install after admin_setup.sql. Existing businesses start with Featured off.
BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- Owners may still edit listings through existing RLS, but only admins can
-- change the featured flag (including when inserting a listing).
CREATE OR REPLACE FUNCTION public.guard_business_featured()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_featured THEN RETURN NEW; END IF;
  ELSIF NEW.is_featured IS NOT DISTINCT FROM OLD.is_featured THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Only administrators can change featured status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_business_featured() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_business_featured ON public.businesses;
CREATE TRIGGER guard_business_featured
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_featured();

COMMIT;

```

## Appendix B: reset_featured_businesses.sql

```sql
-- Run once in the Supabase SQL Editor after admin_featured_setup.sql.
-- This clears every current selection. Do not rerun after curating features
-- unless you intend to clear those selections again.
BEGIN;

-- Hold the table lock until the guard is restored, so concurrent requests
-- cannot change featured status while the administrative reset runs.
LOCK TABLE public.businesses IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.businesses DISABLE TRIGGER guard_business_featured;
ALTER TABLE public.businesses ALTER COLUMN is_featured SET DEFAULT false;
UPDATE public.businesses SET is_featured = false
WHERE is_featured IS DISTINCT FROM false;
ALTER TABLE public.businesses ENABLE TRIGGER guard_business_featured;

SELECT count(*) AS featured_businesses_remaining
FROM public.businesses WHERE is_featured = true;
COMMIT;

```
