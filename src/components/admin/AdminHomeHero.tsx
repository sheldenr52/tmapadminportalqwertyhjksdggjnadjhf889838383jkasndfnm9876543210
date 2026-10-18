import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { AdminHomeHeroStats } from './AdminHomeHeroStats'
import { HeroSlide, heroImageUrl, uploadHeroImage, validHeroUrl, verifyHeroImage } from '../../homeHero'

const blank = (): HeroSlide => ({ id: crypto.randomUUID(), title: '', caption: '', image_path: '', mobile_image_path: null, image_alt: '', cta_label: 'Get Started', cta_url: '', cta_new_tab: false, sort_order: 0, is_active: false })
const message = (e: unknown) => e instanceof Error ? e.message : String(e)

export function AdminHomeHero() {
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [draft, setDraft] = useState<HeroSlide | null>(null)
  const [desktop, setDesktop] = useState<File | null>(null)
  const [mobile, setMobile] = useState<File | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('home_hero_slides').select('*').order('sort_order').order('id')
      if (error) throw error
      setSlides(data || [])
    } catch (e) { setError(message(e)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    const urls = [desktop, mobile].map(file => file ? URL.createObjectURL(file) : '')
    setPreviews(urls)
    return () => urls.forEach(url => { if (url) URL.revokeObjectURL(url) })
  }, [desktop, mobile])
  const edit = (slide: HeroSlide) => { setDraft({ ...slide }); setDesktop(null); setMobile(null); setError(''); setSuccess('') }
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('')
    try { await operation(); await load() } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const confirmHidden = (slide: HeroSlide) => !slide.is_active || slides.filter(s => s.is_active).length > 1 || window.confirm('This is the last published slide. Continue and hide the home hero?')
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft) return
    await run(async () => {
      const row = { ...draft }
      for (const key of ['title', 'caption', 'image_alt', 'cta_label', 'cta_url'] as const) row[key] = row[key].trim()
      if (row.cta_url && !validHeroUrl(row.cta_url)) throw new Error('CTA URL must be a site-relative path or an absolute HTTPS URL without credentials, spaces or backslashes.')
      if (!Number.isInteger(row.sort_order) || row.sort_order < 0) throw new Error('Order must be a nonnegative integer.')
      const limits = { title: 100, caption: 300, image_alt: 160, cta_label: 40 }
      for (const key of Object.keys(limits) as (keyof typeof limits)[]) if (row[key].length > limits[key]) throw new Error(`Check ${key.replace('_', ' ')}.`)
      if (!row.cta_url || row.cta_url.startsWith('/')) row.cta_new_tab = false
      // New uploads are immutable. Failed saves deliberately leave orphan files for later cleanup.
      if (desktop) row.image_path = await uploadHeroImage(desktop, row.id, 'desktop')
      if (mobile) row.mobile_image_path = await uploadHeroImage(mobile, row.id, 'mobile')
      if (row.image_path) await verifyHeroImage(row.image_path)
      if (row.mobile_image_path) await verifyHeroImage(row.mobile_image_path)
      const existing = slides.find(s => s.id === row.id)
      if (existing?.is_active && !row.is_active && !confirmHidden(existing)) return
      const result = existing
        ? await supabase.from('home_hero_slides').update(row).eq('id', row.id).select('id').single()
        : await supabase.from('home_hero_slides').insert(row).select('id').single()
      if (result.error) throw result.error
      setDraft(null); setSuccess('Slide saved.')
    })
  }
  const publish = (slide: HeroSlide) => run(async () => {
    if (!confirmHidden(slide)) return
    if (!slide.is_active) {
      if (slide.image_path) await verifyHeroImage(slide.image_path)
      if (slide.mobile_image_path) await verifyHeroImage(slide.mobile_image_path)
    }
    const { error } = await supabase.from('home_hero_slides').update({ is_active: !slide.is_active }).eq('id', slide.id).select('id').single()
    if (error) throw error
    setSuccess(slide.is_active ? 'Slide unpublished.' : 'Slide published.')
  })
  const remove = (slide: HeroSlide) => run(async () => {
    if (!window.confirm(`Delete "${slide.title}"?`) || !confirmHidden(slide)) return
    if (slide.is_active) {
      const { error } = await supabase.from('home_hero_slides').update({ is_active: false }).eq('id', slide.id).select('id').single()
      if (error) throw error
    }
    const { error } = await supabase.from('home_hero_slides').delete().eq('id', slide.id).select('id').single()
    if (error) throw error
    // Retain files: another row may reference them. Cleanup must check references server-side.
    setSuccess('Slide deleted. Uploaded files retained for safe cleanup.')
  })
  const move = (index: number, offset: number) => run(async () => {
    const ids = slides.map(s => s.id)
    ;[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]
    const { error } = await supabase.rpc('reorder_home_hero_slides', { slide_ids: ids })
    if (error) throw error
    setSuccess('Order saved.')
  })
  const importInitial = () => run(async () => {
    if (!window.confirm('Upload and publish the two original home banners?')) return
    const initial = [
      { file: 'themap-home-image.avif', type: 'image/avif', title: 'Welcome to themap.co.za', caption: 'Empowering South African businesses online with modern websites, business listings, advertising, and more.', service: 'website-design-hosting', image_alt: 'The Map business website services' },
      { file: 'Advertise.webp', type: 'image/webp', title: 'Advertise with The Map', caption: 'Promote your business to a local audience across South Africa.', service: 'advertise-home', image_alt: 'Advertise your business with The Map' },
    ]
    const rows: HeroSlide[] = []
    for (const [index, seed] of initial.entries()) {
      const response = await fetch(`${import.meta.env.BASE_URL}hero-seed/${seed.file}`)
      if (!response.ok) throw new Error('Could not load original banner asset.')
      const row = blank()
      const image_path = await uploadHeroImage(new File([await response.blob()], seed.file, { type: seed.type }), row.id, 'desktop')
      await verifyHeroImage(image_path)
      rows.push({ ...row, title: seed.title, caption: seed.caption, image_alt: seed.image_alt, image_path, cta_url: `/contact-us?service=${seed.service}#contact-form`, sort_order: (index + 1) * 10, is_active: true })
    }
    const { error } = await supabase.from('home_hero_slides').insert(rows).select('id')
    if (error) throw error
    setSuccess('Both original banners uploaded, verified and published.')
  })
  const field = (key: 'title' | 'caption' | 'image_alt' | 'cta_label' | 'cta_url', label: string, max: number) => <div className="form-group"><label htmlFor={`hero-${key}`}>{label} (optional)</label><input id={`hero-${key}`} maxLength={max} value={draft?.[key] || ''} onChange={e => setDraft(d => d && ({ ...d, [key]: e.target.value }))} /></div>
  return <>
    <AdminHomeHeroStats />
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    <button className="btn btn-primary" disabled={busy || loading} onClick={() => edit({ ...blank(), sort_order: Math.max(0, ...slides.map(s => s.sort_order)) + 10 })}>Add slide</button>
    <button className="btn btn-ghost" disabled={busy} onClick={() => void load()}>Refresh</button>
    {!loading && !slides.length && !error && <button className="btn btn-ghost" disabled={busy} onClick={() => void importInitial()}>Import original two banners</button>}
    {draft && <form className="card card-body" onSubmit={save}><fieldset disabled={busy}>
      <legend>{slides.some(s => s.id === draft.id) ? 'Edit slide' : 'New draft'}</legend>
      <div className="form-grid">
        {field('title', 'Heading', 100)}{field('caption', 'Caption', 300)}{field('image_alt', 'Image description', 160)}{field('cta_label', 'Button label', 40)}{field('cta_url', 'Button destination', 2048)}
        <div className="form-group"><label htmlFor="hero-order">Order</label><input id="hero-order" type="number" min="0" step="1" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></div>
        {(['desktop', 'mobile'] as const).map(variant => <div className="form-group" key={variant}><label htmlFor={`hero-${variant}`}>{variant === 'desktop' ? 'Desktop image (optional)' : 'Mobile image (optional)'}</label><input id={`hero-${variant}`} type="file" accept="image/avif,image/webp,image/jpeg,image/png" onChange={e => (variant === 'desktop' ? setDesktop : setMobile)(e.target.files?.[0] || null)} /></div>)}
      </div>
      <p>All fields are optional. An empty order defaults to 0. The button appears when both its label and destination are provided.</p>
      <p>Maximum 5 MB. Recommend desktop 16:9, at least 1600 px wide. Mobile uses the desktop image when no crop is selected.</p>
      <label><input type="checkbox" checked={draft.cta_new_tab} disabled={draft.cta_url.startsWith('/')} onChange={e => setDraft({ ...draft, cta_new_tab: e.target.checked })} /> Open external link in a new tab</label>
      <label><input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} /> Published</label>
      {draft.mobile_image_path && <button type="button" className="btn btn-ghost" onClick={() => { setDraft({ ...draft, mobile_image_path: null }); setMobile(null) }}>Remove mobile crop</button>}
      <div className="hero-previews">{['Desktop', 'Mobile'].map((label, index) => {
        const path = index ? draft.mobile_image_path || draft.image_path : draft.image_path
        const src = (index ? previews[1] || previews[0] : previews[0]) || (path ? heroImageUrl(path) : '')
        return <article key={label} className={index ? 'hero-preview mobile' : 'hero-preview'}><h3>{label} preview</h3>{src && <img src={src} alt={draft.image_alt} />}<h2>{draft.title}</h2><p>{draft.caption}</p>{draft.cta_label && validHeroUrl(draft.cta_url) && <a className="btn btn-primary" href={draft.cta_url.startsWith('/') ? `https://themap.co.za${draft.cta_url}` : draft.cta_url} target="_blank" rel="noopener noreferrer">{draft.cta_label}</a>}</article>
      })}</div>
      <button className="btn btn-primary">{busy ? 'Saving...' : 'Save slide'}</button><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
    </fieldset></form>}
    {loading && <p role="status">Loading slides...</p>}
    {!loading && !slides.length && <p>No slides. The public hero is hidden until a slide is published.</p>}
    <div className="picture-grid">{slides.map((slide, index) => <article className="card" key={slide.id}>{slide.image_path && <img className="picture-image" src={heroImageUrl(slide.image_path)} alt={slide.image_alt} />}<div className="card-body"><h2>{slide.title || 'Untitled banner'}</h2><p>{slide.is_active ? 'Published' : 'Draft'} · Order {slide.sort_order}</p><button className="btn btn-ghost" disabled={busy} onClick={() => edit(slide)}>Edit</button><button className="btn btn-ghost" disabled={busy} onClick={() => void publish(slide)}>{slide.is_active ? 'Unpublish' : 'Publish'}</button><button className="btn btn-ghost" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label={`Move ${slide.title} up`}>Up</button><button className="btn btn-ghost" disabled={busy || index === slides.length - 1} onClick={() => void move(index, 1)} aria-label={`Move ${slide.title} down`}>Down</button><button className="btn btn-danger" disabled={busy} onClick={() => void remove(slide)}>Delete</button></div></article>)}</div>
  </>
}
