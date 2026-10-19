import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { VIDEO_EXTENSIONS, MAX_VIDEO_SIZE, VIDEO_BUCKET } from '../../videos'
import { youtubeId, youtubeEmbedUrl } from '../../youtube'
import { parseProfileLink, profileUrl } from '../../pictures'

interface Video { id: string; storage_path: string | null; youtube_id: string | null; caption: string; business_id: string | null }
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

const ProfileButton = ({ businessId }: { businessId: string | null }) => businessId
  ? <a className="btn btn-primary" href={profileUrl(businessId)} target="_blank" rel="noopener noreferrer">View profile</a>
  : <button className="btn btn-ghost" type="button" disabled>Profile not linked</button>

function VideoCard({ video, onSaved, onDeleted }: { video: Video; onSaved: (video: Video) => void; onDeleted: (id: string, warning?: string) => void }) {
  const [link, setLink] = useState(video.business_id ? profileUrl(video.business_id) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    if (busy || deleting) return
    if (!window.confirm(`Permanently delete "${video.caption}" from the video gallery? This cannot be undone. The linked business profile will remain.`)) return
    setDeleting(true); setError(''); setSaved(false)
    try {
      const { data, error: deleteError } = await supabase.from('profile_videos').delete().eq('id', video.id).select('id').single()
      if (deleteError) throw new Error(deleteError.message)
      if (data?.id !== video.id) throw new Error('The video was not deleted. Check your permissions and try again.')
      let warning: string | undefined
      try {
        if (video.storage_path) {
        const { error: storageError } = await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path])
        if (storageError) throw new Error(storageError.message)
        }
      } catch (cleanupError) {
        warning = `Video removed from the gallery, but its uploaded file could not be deleted: ${message(cleanupError)}`
      }
      onDeleted(video.id, warning)
    } catch (deleteError) { setError(`Could not delete video: ${message(deleteError)}`) }
    finally { setDeleting(false) }
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setSaved(false)
    try {
      const business_id = parseProfileLink(link)
      const { data, error } = await supabase.from('profile_videos').update({ business_id }).eq('id', video.id).select().single()
      if (error) throw new Error(error.code === '23503' ? 'That business profile does not exist.' : error.code === '23505' ? 'That profile already has a promotional video. Unlink its current video first.' : error.message)
      onSaved(data); setSaved(true)
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  return <article className="card video-card">
    {video.youtube_id && youtubeEmbedUrl(video.youtube_id) ? <iframe className="video-image" src={youtubeEmbedUrl(video.youtube_id)!} title={video.caption || 'YouTube promotional video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ border: 0, minHeight: 200 }} /> : video.storage_path ? <video controls playsInline preload="metadata" className="video-image" src={supabase.storage.from(VIDEO_BUCKET).getPublicUrl(video.storage_path).data.publicUrl} aria-label={video.caption} /> : null}
    <div className="card-body">
      <p className="video-caption">{video.caption}</p>
      <ProfileButton businessId={video.business_id} />
      <form onSubmit={save} className="video-link-form">
        <div className="form-group">
          <label htmlFor={`link-${video.id}`}>Profile URL (optional)</label>
          <input id={`link-${video.id}`} type="url" value={link} disabled={busy || deleting} onChange={e => { setLink(e.target.value); setSaved(false) }} placeholder="https://themap.co.za/business?business=…" />
          <small>Leave blank to unlink this video.</small>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={busy || deleting}>{busy ? 'Saving…' : 'Save profile link'}</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy || deleting} aria-label={`Delete video ${video.caption}`} onClick={() => void remove()}>
          {deleting ? 'Deleting...' : 'Delete video'}
        </button>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {saved && <p role="status">Profile link saved.</p>}
      </form>
    </div>
  </article>
}

export function AdminVideos() {
  const [source, setSource] = useState<'youtube' | 'file'>('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  let embedPreview: string | null = null
  try { embedPreview = youtubeEmbedUrl(youtubeId(youtubeUrl)) } catch { /* Show validation on save. */ }
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const load = async () => {
    setLoading(true); setLoadError('')
    try {
      const { data, error } = await supabase.from('profile_videos').select('id,storage_path,youtube_id,caption,business_id').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      setVideos(data ?? [])
    } catch (error) { setLoadError(message(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const upload = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true)
    try {
      const youtube_id = source === 'youtube' ? youtubeId(youtubeUrl) : null
      if (source === 'file') {
        if (!file) throw new Error('Choose a video to upload.')
        if (!VIDEO_EXTENSIONS[file.type]) throw new Error('Choose an MP4 or WebM video.')
        if (!file.size || file.size > MAX_VIDEO_SIZE) throw new Error('Videos must be between 1 byte and 50 MB.')
      }
      const business_id = parseProfileLink(link)
      if (business_id) {
        const { data, error } = await supabase.from('businesses').select('id').eq('id', business_id).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('That business profile does not exist.')
      }
      let storage_path: string | null = null
      if (source === 'file' && file) {
        storage_path = `${crypto.randomUUID()}.${VIDEO_EXTENSIONS[file.type]}`
        const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(storage_path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw new Error(uploadError.message)
      }
      const { data, error: saveError } = await supabase.from('profile_videos').insert({ storage_path, youtube_id, caption: (caption.trim() || (source === 'file' ? file?.name : 'YouTube promotional video') || 'Promotional video').slice(0, 300), business_id }).select().single()
      if (saveError) {
        const cleanupError = storage_path ? (await supabase.storage.from(VIDEO_BUCKET).remove([storage_path])).error : null
        throw new Error(`${saveError.code === '23505' ? 'That profile already has a promotional video. Unlink its current video first.' : saveError.message}${cleanupError ? ' The uploaded file could not be cleaned up.' : ''}`)
      }
      setVideos(previous => [data, ...previous]); setFile(null); setYoutubeUrl(''); setCaption(''); setLink('')
      if (fileInput.current) fileInput.current.value = ''
      setSuccess(source === 'youtube' ? 'YouTube video saved.' : 'Video uploaded.')
    } catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  return <>
    <section className="card">
      <div className="card-header"><h2>Add a promotional video</h2></div>
      <form className="card-body" onSubmit={upload}>
        <p className="video-help">Paste a YouTube URL or upload a promotional video and link it to a business profile. It appears below the profile heading, above About Us. Each profile can have one video.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {success && <div className="alert alert-success" role="status">{success}</div>}
        <div className="form-group" style={{ marginBottom: '1rem' }}><label htmlFor="video-source">Video source</label><select id="video-source" value={source} disabled={busy} onChange={e => { setSource(e.target.value as 'youtube' | 'file'); setError('') }}><option value="youtube">YouTube URL</option><option value="file">Upload a video file</option></select></div>
        <div className="form-grid">
          {source === 'youtube' ? <div className="form-group"><label htmlFor="youtube-url">YouTube video URL</label><input id="youtube-url" type="url" required disabled={busy} value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /><small>Paste a YouTube watch, share or Shorts link. The video must allow embedding.</small></div> : <div className="form-group"><label htmlFor="video-file">Video</label><input ref={fileInput} id="video-file" type="file" accept="video/mp4,video/webm" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /><small>MP4 (H.264 recommended) or WebM. Maximum 50 MB.</small></div>}
          <div className="form-group"><label htmlFor="video-caption">Caption (optional)</label><input id="video-caption" maxLength={300} value={caption} disabled={busy} onChange={e => setCaption(e.target.value)} /></div>
          <div className="form-group"><label htmlFor="video-profile">Profile URL (optional)</label><input id="video-profile" type="url" value={link} disabled={busy} onChange={e => setLink(e.target.value)} placeholder="https://themap.co.za/business?business=…" /></div>
        </div>
        {source === 'youtube' && embedPreview && <iframe className="video-preview" src={embedPreview} title="YouTube preview" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ aspectRatio: '16 / 9', border: 0, minHeight: 200 }} />}
        {source === 'file' && preview && <video controls playsInline preload="metadata" className="video-preview" src={preview} aria-label="Selected video preview" />}
        <div className="form-actions"><button className="btn btn-primary" disabled={busy || loading || !!loadError}>{busy ? 'Saving...' : source === 'youtube' ? 'Save YouTube video' : 'Upload video'}</button></div>
      </form>
    </section>
    <div className="card-header"><h2>Promotional videos ({videos.length})</h2></div>
    {loadError && <div className="alert alert-error" role="alert">Could not load videos: {loadError} <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Retry</button></div>}
    {loading ? <div className="loading-overlay">Loading videos…</div> : !loadError && !videos.length ? <div className="empty-state"><p>No videos yet. Add your first video above.</p></div> : null}
    <div className="video-grid">{videos.map(video => <VideoCard key={video.id} video={video} onSaved={updated => setVideos(previous => previous.map(item => item.id === updated.id ? updated : item))} onDeleted={(id, warning) => {
      setVideos(previous => previous.filter(item => item.id !== id))
      setError(warning || '')
      setSuccess(warning ? '' : 'Video deleted.')
    }} />)}</div>
  </>
}
