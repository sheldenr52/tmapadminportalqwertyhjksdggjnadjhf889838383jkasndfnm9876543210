import React, { useEffect, useState } from 'react'
import { supabase, Business } from '../../supabase'

interface Stats {
  totals: { views: number; unique_visitors: number; interacting_visitors: number; clicks: number }
  actions: Array<{ event_type: string; clicks: number; visitors: number }>
  sources: Array<{ source: string; opens: number; visitors: number }>
  daily: Array<{ day: string; views: number; clicks: number; visitors: number }>
}

const actionLabels: Record<string, string> = {
  listing_open: 'Open listing', call: 'Call', whatsapp: 'WhatsApp', photo: 'Open photo',
}
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const daysAgo = (days: number) => {
  const date = new Date(`${today()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export const AdminListingStats: React.FC<{ business: Business; onClose: () => void }> = ({ business, onClose }) => {
  const [start, setStart] = useState(() => daysAgo(29))
  const [end, setEnd] = useState(today)
  const [refresh, setRefresh] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStats(null)
    setError(null)
    if (!start || !end || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 365) {
      setError('Choose a valid date range of at most 366 days.')
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const { data, error: queryError } = await supabase.rpc('admin_listing_stats', {
          p_business_id: business.id, p_start: start, p_end: end,
        })
        if (queryError) throw queryError
        if (!cancelled) setStats(data as Stats)
      } catch (err) {
        if (!cancelled) setError((err as { message?: string })?.message || 'Could not load statistics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [business.id, start, end, refresh])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="listing-stats-title">
        <div className="modal-header">
          <h2 id="listing-stats-title">Statistics: {business.name}</h2>
          <button className="close-btn" aria-label="Close statistics" onClick={onClose} autoFocus>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group"><label htmlFor="stats-start">From</label><input id="stats-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="form-group"><label htmlFor="stats-end">Through</label><input id="stats-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0' }}>
            {[1, 7, 30].map(days => <button key={days} className="btn btn-ghost btn-sm" onClick={() => { setStart(daysAgo(days - 1)); setEnd(today()) }}>{days === 1 ? 'Today' : `Last ${days} days`}</button>)}
            <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh</button>
          </div>
          <p>Dates include the full day in South African time. Tracking starts when the public website integration is deployed.</p>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading && <p role="status">Loading statistics...</p>}
          {stats && <>
            <div className="stats-grid" style={{ marginTop: '1rem' }}>
              {[
                ['Listing views', stats.totals.views], ['Estimated unique visitors', stats.totals.unique_visitors],
                ['Visitors who clicked', stats.totals.interacting_visitors], ['Total clicks', stats.totals.clicks],
              ].map(([label, value]) => <div className="stat-card" key={label}><div className="label">{label}</div><div className="value">{Number(value).toLocaleString()}</div></div>)}
            </div>
            {stats.totals.unique_visitors === 0 && <p>No recorded interactions in this period. If tracking has not been installed yet, these totals will remain zero.</p>}
            <h3>What visitors clicked</h3>
            <div className="table-wrapper"><table><thead><tr><th>Action</th><th>Clicks</th><th>Unique visitors</th></tr></thead><tbody>
              {Object.entries(actionLabels).map(([event, label]) => {
                const action = stats.actions.find(a => a.event_type === event)
                return <tr key={event}><td>{label}</td><td>{action?.clicks ?? 0}</td><td>{action?.visitors ?? 0}</td></tr>
              })}
            </tbody></table></div>
            <h3>Where listings were opened</h3>
            <div className="table-wrapper"><table><thead><tr><th>Entry point</th><th>Opens</th><th>Unique visitors</th></tr></thead><tbody>
              {['featured', 'results', 'map'].map(source => {
                const entry = stats.sources.find(s => s.source === source)
                return <tr key={source}><td>{source === 'featured' ? 'Featured strip' : source === 'results' ? 'Search results' : 'Map'}</td><td>{entry?.opens ?? 0}</td><td>{entry?.visitors ?? 0}</td></tr>
              })}
            </tbody></table></div>
            <h3>Daily activity</h3>
            <div className="table-wrapper"><table><thead><tr><th>Date</th><th>Views</th><th>Clicks</th><th>Unique visitors</th></tr></thead><tbody>
              {stats.daily.map(day => <tr key={day.day}><td>{day.day}</td><td>{day.views}</td><td>{day.clicks}</td><td>{day.visitors}</td></tr>)}
            </tbody></table></div>
            <p style={{ fontSize: '0.8rem', marginTop: '1rem' }}>Unique visitors estimate browsers, not people. Clicks include opening a listing. Call and WhatsApp clicks do not confirm completed conversations. Daily and action-level unique counts can overlap; do not add them together.</p>
          </>}
        </div>
      </div>
    </div>
  )
}
