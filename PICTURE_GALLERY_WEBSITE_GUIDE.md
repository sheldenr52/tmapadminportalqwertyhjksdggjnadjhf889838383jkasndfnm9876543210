# Display The Map pictures on another website

This guide adds a public gallery showing **only images and profile buttons**. Upload and manage pictures in the admin app's **Pictures** section. Visitors to the other website do not need to sign in.

- Linked picture: **View profile** opens `https://themap.co.za/business?business=BUSINESS_ID` in a new tab.
- Unlinked picture: **Profile not linked** is a disabled button.
- Pictures appear newest first. Reloading the page picks up new uploads and link changes.

## 1. Prepare Supabase

Run `supabase/picture_gallery_setup.sql` from this admin project in its Supabase SQL Editor if you have not already done so. It requires the existing admin setup and businesses table. Run it once; its policies are not designed to be created repeatedly.

The gallery uses:

| Item | Value |
| --- | --- |
| Supabase project URL | `https://bouxpfsfhetcqcrqflfk.supabase.co` |
| Table | `public.picture_gallery` |
| Public image bucket | `profile-pictures` |
| Profile identifier | Nullable `business_id` column |

The setup script permits public reads and restricts writes to admins. Images in this bucket and gallery records are publicly accessible.

Get this project's **publishable key** or legacy **anon key** from Supabase's project API settings. The existing admin app uses `VITE_SUPABASE_ANON_KEY` in `.env.local`. Use the key for the same project as the URL above. Never use a secret or service-role key in website code.

## 2. Add this gallery to the other website

Copy the following into an HTML page, or a website builder's custom HTML area that allows JavaScript. Replace `PASTE_YOUR_PUBLIC_KEY_HERE` with your publishable or anon key. No packages are required.

If your builder strips scripts, put the HTML and CSS in its HTML area and the JavaScript in its custom JavaScript area. Include the gallery once per page. For React or another framework, use the same request and button rules inside a component instead of pasting this script into JSX.

```html
<style>
  .map-picture-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 20px;
  }
  .map-picture-card {
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
  }
  .map-picture-card img {
    display: block;
    width: 100%;
    height: 260px;
    object-fit: contain;
    background: #f3f4f6;
  }
  .map-picture-actions { padding: 16px; }
  .map-profile-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 10px 16px;
    border: 0;
    border-radius: 8px;
    background: #2563eb;
    color: #fff;
    font: 600 14px/1.4 system-ui, sans-serif;
    text-decoration: none;
    cursor: pointer;
  }
  .map-profile-button:hover { background: #1d4ed8; }
  .map-profile-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
  .map-profile-button:disabled {
    background: #e5e7eb;
    color: #6b7280;
    cursor: not-allowed;
  }
</style>

<p id="map-gallery-status" role="status">Loading pictures…</p>
<div id="map-picture-gallery" class="map-picture-gallery" aria-label="Picture gallery"></div>

<script type="module">
  const SUPABASE_URL = 'https://bouxpfsfhetcqcrqflfk.supabase.co';
  const PUBLIC_KEY = 'PASTE_YOUR_PUBLIC_KEY_HERE';
  const gallery = document.getElementById('map-picture-gallery');
  const status = document.getElementById('map-gallery-status');

  async function loadPictures() {
    try {
      if (PUBLIC_KEY === 'PASTE_YOUR_PUBLIC_KEY_HERE') {
        throw new Error('Set the Supabase publishable or anon key first.');
      }

      // Fetch in pages so galleries larger than the API row limit are included.
      const pictures = [];
      const pageSize = 100;
      let offset = 0;
      while (true) {
        const url = new URL(`${SUPABASE_URL}/rest/v1/picture_gallery`);
        url.searchParams.set('select', 'id,storage_path,caption,business_id');
        url.searchParams.set('order', 'created_at.desc,id.desc');
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('offset', String(offset));

        const response = await fetch(url, {
          headers: { apikey: PUBLIC_KEY },
        });
        if (!response.ok) throw new Error(`Gallery request failed (${response.status}).`);
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('Unexpected gallery response.');
        pictures.push(...page);
        if (!page.length) break;
        offset += page.length;
      }

      const fragment = document.createDocumentFragment();
      for (const picture of pictures) {
        const card = document.createElement('article');
        card.className = 'map-picture-card';

        const image = document.createElement('img');
        const path = picture.storage_path.split('/').map(encodeURIComponent).join('/');
        image.src = `${SUPABASE_URL}/storage/v1/object/public/profile-pictures/${path}`;
        image.alt = picture.caption || 'The Map gallery picture';
        image.loading = 'lazy';
        image.decoding = 'async';
        card.append(image);

        const actions = document.createElement('div');
        actions.className = 'map-picture-actions';
        if (picture.business_id) {
          const link = document.createElement('a');
          link.className = 'map-profile-button';
          link.textContent = 'View profile';
          link.href = `https://themap.co.za/business?business=${encodeURIComponent(picture.business_id)}`;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          actions.append(link);
        } else {
          const button = document.createElement('button');
          button.className = 'map-profile-button';
          button.type = 'button';
          button.textContent = 'Profile not linked';
          button.disabled = true;
          actions.append(button);
        }
        card.append(actions);
        fragment.append(card);
      }
      gallery.replaceChildren(fragment);
      status.textContent = pictures.length ? '' : 'No pictures available yet.';
    } catch (error) {
      console.error('The Map gallery:', error);
      status.textContent = 'Pictures could not be loaded. Please try again later.';
    }
  }

  loadPictures();
</script>
```

Caption text is used only as the image's accessible description; it is not displayed separately. Image proportions are preserved. Change `object-fit: contain` to `object-fit: cover` if you prefer cropped cards.

## 3. Check the result

1. Upload one picture without a profile URL in the admin app.
2. Upload another with a valid profile URL, such as `https://themap.co.za/business?business=d2f02086-16de-47ed-a4ed-3311342f6d69`.
3. Open the other website while signed out. Both images should appear.
4. Confirm **Profile not linked** cannot be clicked and **View profile** opens the linked business.
5. Change or remove a picture's profile link in the admin app, save, and reload the other website to verify the button changes.

## Troubleshooting

- **401 or 403:** Check the public key belongs to the project above and that the setup script's grants and public SELECT policy are in place.
- **404 or missing table:** Run the setup script in the correct project and ensure `public` is exposed through its Data API settings.
- **Images fail to load:** Confirm the `profile-pictures` bucket exists, is public, and contains the recorded `storage_path` files.
- **No pictures:** Upload through the admin app and ensure both websites use the same Supabase project.
- **Script does not run:** Check whether your builder supports custom JavaScript. If the site uses a Content Security Policy, allow requests and images from `https://bouxpfsfhetcqcrqflfk.supabase.co` and place the script in the site's approved script location.

## References

- [Supabase REST API](https://supabase.com/docs/guides/api/rest)
- [Serving files from Supabase Storage](https://supabase.com/docs/guides/storage/serving/downloads)
