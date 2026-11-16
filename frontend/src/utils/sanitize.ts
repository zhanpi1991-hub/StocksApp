const ALLOWED = new Set(['A', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI'])

/**
 * Reduce provider-supplied HTML (CoinGecko descriptions) to a small safe subset.
 *
 * Only descendants of <body> are visited. The parsed document's own <html>/<head>/<body>
 * elements must never be touched: calling replaceWith() on <html> throws
 * "Only one element on document allowed" (this was the crypto detail crash).
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = Array.from(doc.body.querySelectorAll('*')).reverse() // children before parents
  for (const el of nodes) {
    if (!ALLOWED.has(el.tagName)) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') el.remove()
      else el.replaceWith(...Array.from(el.childNodes))
      continue
    }
    const href = el.tagName === 'A' ? (el.getAttribute('href') ?? '') : ''
    for (const a of Array.from(el.attributes)) el.removeAttribute(a.name)
    if (el.tagName === 'A') {
      if (/^https?:\/\//i.test(href)) {
        el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noreferrer noopener')
      } else el.replaceWith(...Array.from(el.childNodes))
    }
  }
  return doc.body.innerHTML
}
