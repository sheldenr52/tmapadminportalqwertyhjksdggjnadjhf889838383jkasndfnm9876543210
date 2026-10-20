import { useState } from 'react'
import { Business, supabase } from '../../supabase'
import { safeWebUrl } from '../../demoLinks'

export function AdminProfilePdf({ business }: { business: Business }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const generate = async () => {
    if (busy) return
    setBusy(true); setError(''); setStatus('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: pictures, error: picturesError }, { data: video, error: videoError }, { data: files, error: filesError }, { data: posts, error: postsError }, adminFiles] = await Promise.all([
        supabase.from('picture_gallery').select('storage_path').eq('business_id', business.id).order('created_at'),
        supabase.from('profile_videos').select('youtube_id,storage_path,caption').eq('business_id', business.id).maybeSingle(),
        supabase.storage.from('business-images').list(`${business.owner_id}/${business.id}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
        supabase.from('business_media_and_posts').select('photo_url').eq('business_id', business.id).eq('media_type', 'photo').order('created_at'),
        user && user.id !== business.owner_id
          ? supabase.storage.from('business-images').list(`${user.id}/${business.id}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
          : Promise.resolve({ data: [], error: null }),
      ])
      const optionalTableMissing = (error: { code?: string } | null) => error && ['42P01', 'PGRST205'].includes(error.code || '')
      if ((picturesError && !optionalTableMissing(picturesError)) || (videoError && !optionalTableMissing(videoError)) || filesError || adminFiles.error || (postsError && !optionalTableMissing(postsError))) {
        throw new Error('Could not load all profile media. Please try again or check your media permissions.')
      }
      const photos = [...new Set([
        ...(posts || []).map(p => safeWebUrl(p.photo_url)).filter((url): url is string => Boolean(url)),
        ...(pictures || []).map(p => supabase.storage.from('profile-pictures').getPublicUrl(p.storage_path).data.publicUrl),
        ...(files || []).filter(f => f.id && /\.(png|jpe?g|webp|gif)$/i.test(f.name)).map(f =>
          supabase.storage.from('business-images').getPublicUrl(`${business.owner_id}/${business.id}/${f.name}`).data.publicUrl),
        ...(adminFiles.data || []).filter(f => f.id && /\.(png|jpe?g|webp|gif)$/i.test(f.name)).map(f =>
          supabase.storage.from('business-images').getPublicUrl(`${user!.id}/${business.id}/${f.name}`).data.publicUrl),
      ])]
      const youtube = video?.youtube_id && /^[a-zA-Z0-9_-]{11}$/.test(video.youtube_id) ? video.youtube_id : undefined
      const { createProfilePdf } = await import('../../profilePdf')
      const result = await createProfilePdf(business, {
        photos,
        videoUrl: youtube ? `https://www.youtube.com/watch?v=${youtube}` : video?.storage_path
          ? safeWebUrl(supabase.storage.from('profile-videos').getPublicUrl(video.storage_path).data.publicUrl) : undefined,
        videoThumbnail: youtube ? `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg` : undefined,
        videoCaption: video?.caption,
      })
      result.pdf.save(result.filename)
      setStatus(`PDF downloaded.${result.condensed ? ' Content shortened to fit one page; gallery shows up to six photos.' : ''}${result.missingImages ? ` ${result.missingImages} image(s) could not load and were omitted or marked unavailable.` : ''}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate PDF. Please try again.') }
    finally { setBusy(false) }
  }
  return <div style={{ marginTop: 6, maxWidth: 230 }}>
    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void generate()}
      aria-label={`Generate PDF preview for ${business.name}`}>{busy ? 'Generating PDF...' : 'Generate preview (PDF)'}</button>
    {status && <small role="status" style={{ display: 'block' }}>{status}</small>}
    {error && <small role="alert" style={{ display: 'block', color: 'var(--danger)' }}>{error}</small>}
  </div>
}
