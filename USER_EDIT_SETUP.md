# Editing user details

In **All Users**, select **Edit details**, change the email or names, and select
**Save changes**. The form preserves existing full names even when first and last
names are empty. The optional **Use first and last name as full name** button
combines those fields. Blank name fields clear the corresponding stored value.

Email changes update the sign-in address immediately. The form shows a reminder
when an address changes. Passwords, verification settings, account roles,
business contact details, and subscription records are not edited by this feature.

## Backend deployment

Deploy `supabase/functions/admin-update-user/index.ts` as an Edge Function named
`admin-update-user` in project `bouxpfsfhetcqcrqflfk`. In the Supabase dashboard,
open **Edge Functions**, create a function via the editor, paste that file, and
deploy it with the exact name above. Supabase supplies `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; never put the service-role key in
the frontend environment.

The function validates the caller's access token with Auth and checks the existing
`public.admin_users` table before looking up or changing a target user. It accepts
only the user ID, email, first name, last name, and full name. It uses the Auth
Admin API, which updates the source of the existing `user_profiles` view, and
does not require a database migration. Unknown metadata keys remain intact
because only the three edited name keys are sent in the metadata patch.

The admin app needs its existing `VITE_SUPABASE_FUNCTION_URL` pointing to this
project's `/functions/v1` URL. Build and deploy the admin frontend as usual.

## Verification

Run `node tests/user-edit.mjs` and `npm.cmd run build`. The tests execute the
actual handler and Supabase client against a fake HTTP service, covering denied
access, invalid input, field restrictions, successful changes, blank names,
unchanged email, duplicate email, missing users, and network failures.

After deployment, edit a dedicated test account and refresh All Users and the
Supabase `user_profiles` view to confirm persistence. Check duplicate email
errors and verify that an ordinary signed-in account receives HTTP 403 from
the endpoint. Users may need to refresh their session to see updated metadata
in the public application. Any legacy subscription linked only by email should
be checked separately before changing that account's sign-in email.

Live project access and Edge Function deployment were denied by the connected
Supabase account during development. The function is not deployed. Live schema
compatibility, triggers, and end-to-end persistence have not been verified.

Reference: [Supabase Auth admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
