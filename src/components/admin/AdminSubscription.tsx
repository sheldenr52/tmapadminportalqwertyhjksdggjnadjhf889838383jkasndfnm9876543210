import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'

interface AccessDetails {
  owner_id: string
  owner_email: string | null
  subscription_id: string | null
  subscription_status: string | null
  last_renewal_date: string | null
  access_until: string | null
  extension_until: string
  last_sponsored_at: string | null
}

export const formatSubscriptionDate = (value: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  : 'None recorded'

// One component per account; refresh events keep multiple listings for an owner in sync.
export const AdminSubscription: React.FC<{ ownerId: string }> = ({ ownerId }) => {
  const [details, setDetails] = useState<AccessDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const busy = useRef(false)
  const requestId = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await supabase.rpc('admin_subscription_details', { p_owner_id: ownerId })
        if (fetchError) throw fetchError
        if (!cancelled) setDetails(data as AccessDetails)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : (err as { message?: string }).message || 'Unable to load subscription.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === ownerId) void load()
    }
    void load()
    window.addEventListener('subscription-updated', refresh)
    return () => { cancelled = true; window.removeEventListener('subscription-updated', refresh) }
  }, [ownerId])

  const extend = async () => {
    if (busy.current || !details) return
    busy.current = true
    setSaving(true)
    setError(null)
    setSuccess(null)
    requestId.current ||= crypto.randomUUID()
    try {
      const { data, error: saveError } = await supabase.rpc('admin_extend_trial_month', {
        p_owner_id: ownerId,
        p_request_id: requestId.current,
        p_expected_until: details.extension_until,
      })
      if (saveError) throw saveError
      setDetails(data as AccessDetails)
      setSuccess(`Sponsored access until ${formatSubscriptionDate((data as AccessDetails).access_until)}.`)
      setConfirming(false)
      requestId.current = null
      window.dispatchEvent(new CustomEvent('subscription-updated', { detail: ownerId }))
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string }).message || 'Extension failed. Please retry.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  return (
    <div className="subscription-details" aria-busy={loading || saving}>
      {loading ? <span>Loading subscription...</span> : details && <>
        <div><strong>Subscription:</strong> {details.subscription_status || 'No subscription'}</div>
        <div><strong>Last renewal:</strong> {formatSubscriptionDate(details.last_renewal_date)}</div>
        <div><strong>Access until:</strong> {formatSubscriptionDate(details.access_until)}</div>
        {details.last_sponsored_at && <div>Last sponsored: {formatSubscriptionDate(details.last_sponsored_at)}</div>}
        {!confirming && <button className="btn btn-ghost btn-sm" onClick={() => { setConfirming(true); setSuccess(null) }}>
          Sponsor / extend trial by 1 month
        </button>}
        {confirming && <div className="subscription-confirm">
          <p>Give {details.owner_email || 'this owner'} free access until <strong>{formatSubscriptionDate(details.extension_until)}</strong>?</p>
          <p>Applies to all their listings. Existing PayFast charges continue on their current schedule.</p>
          <div className="subscription-buttons">
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={extend}>{saving ? 'Extending...' : 'Confirm free month'}</button>
            <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>}
      </>}
      {error && <div className="subscription-error" role="alert">{error}</div>}
      {success && <div role="status">{success}</div>}
    </div>
  )
}
