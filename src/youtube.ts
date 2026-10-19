export function youtubeId(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a valid YouTube video URL.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Enter a valid YouTube video URL.')
  const host = url.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1)
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Paste a YouTube watch, share, Shorts or live video URL.')
  return id
}

export function youtubeEmbedUrl(id: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
}
