-- Run once in the project's Supabase SQL Editor after admin_setup.sql.
-- Uses the existing user_subscriptions schema; no payment history is fabricated.
BEGIN;

CREATE SCHEMA IF NOT EXISTS admin_private;
REVOKE ALL ON SCHEMA admin_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA admin_private TO authenticated;

CREATE TABLE IF NOT EXISTS admin_private.trial_extensions (
  request_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id),
  previous_until date,
  extended_until date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.trial_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.trial_extensions FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS trial_extensions_owner_created_idx
  ON admin_private.trial_extensions (owner_id, created_at DESC);

-- The private functions require elevated access to auth.users and the audit log.
-- Both check the caller against the existing admin helper before reading data.
CREATE OR REPLACE FUNCTION admin_private.subscription_details(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text;
  v_subscription public.user_subscriptions%ROWTYPE;
  v_until date;
  v_last_renewal date;
  v_sponsored_at timestamptz;
  v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_owner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner account not found'; END IF;

  -- Match the account application's ordering; only use unlinked email records
  -- when there is no subscription directly assigned to this owner.
  SELECT s.* INTO v_subscription FROM public.user_subscriptions s
  WHERE s.user_id = p_owner_id OR (s.user_id IS NULL AND s.email = v_email)
  ORDER BY (s.user_id = p_owner_id) DESC NULLS LAST,
    s.last_paid_date DESC NULLS LAST, s.updated_at DESC, s.id
  LIMIT 1;

  SELECT max(s.last_paid_date) INTO v_last_renewal
  FROM public.user_subscriptions s
  WHERE s.user_id = p_owner_id OR (s.user_id IS NULL AND s.email = v_email);

  v_until := coalesce(v_subscription.next_billing_date,
    (v_subscription.last_paid_date + CASE lower(v_subscription.frequency::text)
      WHEN '4' THEN interval '3 months' WHEN 'quarterly' THEN interval '3 months'
      WHEN '5' THEN interval '6 months' WHEN 'biannually' THEN interval '6 months'
      WHEN 'biannual' THEN interval '6 months'
      WHEN '6' THEN interval '1 year' WHEN 'annually' THEN interval '1 year'
      WHEN 'annual' THEN interval '1 year' WHEN 'yearly' THEN interval '1 year'
      ELSE interval '1 month' END)::date);
  SELECT max(created_at) INTO v_sponsored_at FROM admin_private.trial_extensions
    WHERE owner_id = p_owner_id;
  RETURN jsonb_build_object(
    'owner_id', p_owner_id, 'owner_email', v_email,
    'subscription_id', v_subscription.id, 'subscription_status', v_subscription.subscription_status,
    'last_renewal_date', v_last_renewal,
    'access_until', v_until,
    'extension_until', (greatest(v_today, v_until) + interval '1 month')::date,
    'last_sponsored_at', v_sponsored_at);
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.extend_trial_month(
  p_owner_id uuid, p_request_id uuid, p_expected_until date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_details jsonb;
  v_subscription_id uuid;
  v_until date;
  v_existing_owner uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_admin(), false) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_expected_until IS NULL THEN
    RAISE EXCEPTION 'Request ID and expected expiry are required';
  END IF;
  -- Serialize grants for an owner, including when no subscription exists yet.
  PERFORM 1 FROM auth.users WHERE id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner account not found'; END IF;
  SELECT owner_id INTO v_existing_owner FROM admin_private.trial_extensions
    WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_owner <> p_owner_id THEN RAISE EXCEPTION 'Request ID already used'; END IF;
    RETURN admin_private.subscription_details(p_owner_id);
  END IF;

  v_details := admin_private.subscription_details(p_owner_id);
  v_subscription_id := (v_details->>'subscription_id')::uuid;
  IF v_subscription_id IS NOT NULL THEN
    PERFORM 1 FROM public.user_subscriptions WHERE id = v_subscription_id FOR UPDATE;
    -- Re-read after locking to include any payment received during this request.
    v_details := admin_private.subscription_details(p_owner_id);
    IF (v_details->>'subscription_id')::uuid IS DISTINCT FROM v_subscription_id THEN
      RAISE EXCEPTION 'Subscription changed. Refresh the page before extending.';
    END IF;
  END IF;
  v_until := (v_details->>'extension_until')::date;
  IF v_until IS DISTINCT FROM p_expected_until THEN
    RAISE EXCEPTION 'Subscription changed. Refresh the page and review the new expiry before extending.';
  END IF;

  IF v_subscription_id IS NULL THEN
    IF v_details->>'owner_email' IS NULL THEN RAISE EXCEPTION 'Owner needs an email address'; END IF;
    INSERT INTO public.user_subscriptions (
      user_id, email, subscription_status, plan_name, amount, frequency,
      subscription_start_date, next_billing_date, grace_period_end
    ) VALUES (
      p_owner_id, v_details->>'owner_email', 'pending', 'Sponsored trial', 0, 'monthly',
      (now() AT TIME ZONE 'Africa/Johannesburg')::date, v_until, v_until + 7
    ) RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.user_subscriptions SET
      next_billing_date = v_until,
      grace_period_end = v_until + 7,
      subscription_status = CASE WHEN subscription_status = 'active' THEN 'active' ELSE 'pending' END,
      updated_at = now()
    WHERE id = v_subscription_id;
  END IF;

  INSERT INTO admin_private.trial_extensions (
    request_id, owner_id, admin_id, subscription_id, previous_until, extended_until
  ) VALUES (
    p_request_id, p_owner_id, auth.uid(), v_subscription_id,
    (v_details->>'access_until')::date, v_until
  );
  RETURN admin_private.subscription_details(p_owner_id);
END;
$$;

-- Exposed wrappers run as the caller; private implementations enforce admin access.
CREATE OR REPLACE FUNCTION public.admin_subscription_details(p_owner_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT admin_private.subscription_details(p_owner_id);
$$;
CREATE OR REPLACE FUNCTION public.admin_extend_trial_month(
  p_owner_id uuid, p_request_id uuid, p_expected_until date
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT admin_private.extend_trial_month(p_owner_id, p_request_id, p_expected_until);
$$;

REVOKE ALL ON FUNCTION admin_private.subscription_details(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_private.extend_trial_month(uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_subscription_details(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_extend_trial_month(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_private.subscription_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_private.extend_trial_month(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_subscription_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial_month(uuid, uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
