import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

interface BannerStats {
  slide_id: string; title: string; views: number; unique_viewers: number
  clicks: number; unique_clickers: number; unique_ctr_percent: number | null
}
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())
const daysAgo = (days: number) => {
  const date = new Date(`${today()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function AdminHomeHeroStats() {
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [refresh, setRefresh] = useState(0)
  const [rows, setRows] = useState<BannerStats[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setRows(null); setError('')
    if (!start || !end || start > end || Date.parse(end) - Date.parse(start) > 365 * 86400000) {
      setError('Choose a valid date range of at most 366 days.'); setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('admin_home_hero_stats', { p_start: start, p_end: end })
        if (error) throw error
        if (!cancelled) setRows(data || [])
      } catch (err) {
        if (!cancelled) setError((err as { message?: string }).message || 'Could not load banner statistics.')
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [start, end, refresh])

  return <section className="card card-body" aria-labelledby="hero-stats-heading" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
    <h2 id="hero-stats-heading">Banner performance</h2>
    <div className="form-grid">
      <div className="form-group"><label htmlFor="hero-stats-start">From</label><input id="hero-stats-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
      <div className="form-group"><label htmlFor="hero-stats-end">Through</label><input id="hero-stats-end" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '1rem 0' }}>
      {[1, 7, 30].map(days => <button key={days} className="btn btn-ghost btn-sm" onClick={() => { setStart(daysAgo(days - 1)); setEnd(today()) }}>{days === 1 ? 'Today' : `Last ${days} days`}</button>)}
      <button className="btn btn-primary btn-sm" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh statistics</button>
    </div>
    <p>Dates include the full day in South African time. Unique CTR = unique clickers ÷ unique viewers.</p>
    {loading && <p role="status">Loading banner statistics...</p>}
    {error && <div className="alert alert-error" role="alert">{error} If reporting has not been installed, run supabase/home_hero_analytics_setup.sql in the Supabase SQL Editor.</div>}
    {rows && <>
      {!rows.some(row => row.views || row.clicks) && <p>No recorded banner activity in this period. Events appear once the public website records banner views and clicks.</p>}
      <div className="table-wrapper"><table><thead><tr><th>Banner</th><th>Views</th><th>Unique viewers</th><th>Clicks</th><th>Unique clickers</th><th>Unique CTR</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.slide_id}><td>{row.title || 'Untitled banner'}<br /><small>{row.slide_id}</small></td><td>{Number(row.views).toLocaleString()}</td><td>{Number(row.unique_viewers).toLocaleString()}</td><td>{Number(row.clicks).toLocaleString()}</td><td>{Number(row.unique_clickers).toLocaleString()}</td><td>{row.unique_ctr_percent === null ? '—' : `${Number(row.unique_ctr_percent).toFixed(2)}%`}</td></tr>)}
        {!rows.length && <tr><td colSpan={6}>No banners to report.</td></tr>}
      </tbody></table></div>
      <p>Unique counts estimate browsers, not people, and can overlap across banners. Deleted banners appear when their retained events fall within this period.</p>
    </>}
  </section>
}
