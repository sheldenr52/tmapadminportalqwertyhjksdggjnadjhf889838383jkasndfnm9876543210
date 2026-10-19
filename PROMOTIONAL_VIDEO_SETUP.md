# Promotional videos

YouTube support: run `supabase/profile_videos_youtube_setup.sql` after the initial setup, including on installations already using uploaded videos. This preserves existing records and adds a validated YouTube video ID as an alternative to a storage file. In **Promotional Videos**, select **YouTube URL**, paste the link, optionally add a caption and profile URL, then select **Save YouTube video**. Watch, youtu.be, Shorts, live, and embed links are supported. Videos must be available and allow embedding on YouTube. Both apps must be redeployed for this update.

The admin sidebar's **Promotional Videos** section uploads MP4/WebM files up to 50 MB. Add a business profile URL to attach a video, or leave it blank to upload an unlinked video. Each business profile has at most one promotional video. Unlink or delete the current video before assigning a different one. Uploads are public; admin accounts alone can change records or files.

## Activate storage

Run `supabase/profile_videos_setup.sql` in the SQL Editor for the app's existing Supabase project (`bouxpfsfhetcqcrqflfk`). It requires `businesses` and the existing `is_admin()` function from `admin_setup.sql`. The script is safe to rerun. It creates `profile_videos`, the public `profile-videos` bucket, and admin access policies.

The currently connected Supabase account does not list this project, so live setup and upload verification have not been performed.

## Public website

The sibling `the_map/business-finder-react` source includes `ProfilePromoVideo` in `BusinessDetailsPage.tsx`, immediately before the About section, matching the requested placement. Publish both the admin portal and main website after database setup. The player uses controls, inline playback, metadata preloading, and a responsive 16:9 frame. Profiles without a video retain their existing layout. Playback failure hides the player.

`src/components/ProfilePromoVideo.tsx` in this admin checkout is a reusable copy; for another site, change its Supabase import to that site's client and mount `<ProfilePromoVideo key={business.id} businessId={business.id} />` before About Us.

MP4 with H.264/AAC gives broad browser support. Files are uploaded directly using the existing Supabase client. Keep the page open while uploading; this version does not resume interrupted uploads. Supabase recommends [resumable uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) for larger files.

## Verification

Run `npm.cmd run build` and `node tests/profile-videos.mjs`. The SQL test checks admin-only changes, public reads, one video per profile, invalid profile rejection, and protection against broad pre-existing storage policies. After applying setup, test upload, playback on a linked public profile, unlinking, and deletion with an admin login.
