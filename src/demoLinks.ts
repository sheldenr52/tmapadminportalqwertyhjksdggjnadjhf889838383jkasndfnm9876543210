export function demoProfileUrl(token: string, base = window.location.origin + window.location.pathname): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid demo link returned by server.')
  const url = new URL(base)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid preview website address.')
  url.search = ''
  url.hash = `demo/${token}`
  return url.href
}

export function safeWebUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch { return undefined }
}
