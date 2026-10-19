import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { safeWebUrl } from '../demoLinks'
import { youtubeEmbedUrl } from '../youtube'
import './DemoProfile.css'

interface Preview {
  business: {
    name: string; description: string | null; address: string | null; categories: string[] | null;
    logo_url: string | null; contact_phone: string | null; contact_email: string | null;
    whatsapp_number: string | null; website_url: string | null;
  }
  photos: string[]
  video: { youtube_id: string | null; storage_path: string | null; caption: string | null } | null
}

export default function DemoProfile({ token }: { token: string }) {
  const [profile, setProfile] = useState<Preview | null>(null)
  const [status, setStatus] = useState('Loading your business preview...')
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'; robots.content = 'noindex, nofollow, noarchive'
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'; referrer.content = 'no-referrer'
    document.head.append(robots, referrer)
    const previousTitle = document.title
    document.title = 'Business preview | The Map'
    return () => { robots.remove(); referrer.remove(); document.title = previousTitle }
  }, [])
  useEffect(() => {
    let cancelled = false
    setProfile(null); setStatus('Loading your business preview...'); setSelectedPhoto(null)
    if (!/^[a-f0-9]{64}$/.test(token)) { setStatus('This preview link is unavailable. Ask your contact for a new link.'); return }
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('business-demo', { body: { token } })
        if (cancelled) return
        if (error || !data?.business) throw new Error('unavailable')
        setProfile(data as Preview); setStatus('')
      } catch {
        if (!cancelled) setStatus('This preview is unavailable. The link may have been revoked or the business is no longer in Demo. Ask your contact for a current link.')
      }
    })()
    return () => { cancelled = true }
  }, [token])
  useEffect(() => {
    if (!selectedPhoto) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPhoto(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [selectedPhoto])
  if (!profile) return <main className="demo-profile"><header className="demo-brand">THE MAP</header>
    <section className="demo-card" role="status"><h1>Business preview</h1><p>{status}</p></section></main>
  const b = profile.business
  const website = safeWebUrl(b.website_url)
  const logo = safeWebUrl(b.logo_url)
  const youtube = profile.video?.youtube_id ? youtubeEmbedUrl(profile.video.youtube_id) : null
  const video = profile.video?.storage_path ? supabase.storage.from('profile-videos').getPublicUrl(profile.video.storage_path).data.publicUrl : null
  const whatsapp = (b.whatsapp_number || b.contact_phone || '').replace(/\D/g, '').replace(/^0/, '27')
  return <main className="demo-profile">
    <header className="demo-brand">THE MAP <span>Client preview</span></header>
    <p className="demo-notice">Demo profile · Shared with you for review. This listing is not in public search.</p>
    <section className="demo-card demo-heading">
      {logo && <img src={logo} alt={`${b.name} logo`} referrerPolicy="no-referrer" />}
      <div><h1>{b.name}</h1><div className="demo-categories">{(b.categories || []).map(c => <span key={c}>{c}</span>)}</div></div>
    </section>
    {(youtube || video) && <section className="demo-card">
      {youtube ? <iframe src={youtube} title={profile.video?.caption || 'Promotional video'} allowFullScreen referrerPolicy="no-referrer" /> :
        <video controls playsInline preload="metadata" src={video!} aria-label="Promotional video" />}
      {profile.video?.caption && <p>{profile.video.caption}</p>}
    </section>}
    <section className="demo-card"><h2>About us</h2><p className="demo-description">{b.description || 'More information coming soon.'}</p></section>
    <div className="demo-info-grid">
      <section className="demo-card"><h2>Contact</h2>
        {b.contact_phone && <p><a href={`tel:${b.contact_phone.replace(/[^\d+]/g, '')}`}>{b.contact_phone}</a></p>}
        {b.contact_email && <p><a href={`mailto:${b.contact_email}`}>{b.contact_email}</a></p>}
        {whatsapp && <p><a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hi, I'd like to know more about ${b.name}.`)}`} target="_blank" rel="noopener noreferrer">Message on WhatsApp</a></p>}
        {website && <p><a href={website} target="_blank" rel="noopener noreferrer">Visit website</a></p>}
      </section>
      <section className="demo-card"><h2>Location</h2><p>{b.address || 'Location coming soon.'}</p>
        {b.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`} target="_blank" rel="noopener noreferrer">View on map</a>}
      </section>
    </div>
    <section className="demo-card"><h2>Photos</h2>
      <div className="demo-photos">{(profile.photos || []).map(safeWebUrl).filter((url): url is string => Boolean(url)).map((url, i) =>
        <button key={`${url}-${i}`} onClick={() => setSelectedPhoto(url)} aria-label={`Open photo ${i + 1}`}><img loading="lazy" src={url} alt={`${b.name} photo ${i + 1}`} referrerPolicy="no-referrer" /></button>)}</div>
      {!profile.photos?.length && <p>Photos coming soon.</p>}
    </section>
    {selectedPhoto && <div className="demo-lightbox" role="dialog" aria-modal="true" aria-label="Business photo" onClick={() => setSelectedPhoto(null)}>
      <button autoFocus onClick={() => setSelectedPhoto(null)} aria-label="Close photo">Close ×</button>
      <img src={selectedPhoto} alt={`${b.name} enlarged photo`} referrerPolicy="no-referrer" onClick={e => e.stopPropagation()} />
    </div>}
    <footer>Powered by The Map · Business profile preview</footer>
  </main>
}
