import { sanitizeHtml } from '@/utils/sanitize'

describe('sanitizeHtml', () => {
  it('does not throw on <html>/<body> wrapped or plain input (replaceWith regression)', () => {
    expect(() => sanitizeHtml('Bitcoin is <a href="https://bitcoin.org">digital</a> money')).not.toThrow()
    expect(() => sanitizeHtml('<html><body><div><span>x</span></div></body></html>')).not.toThrow()
    expect(sanitizeHtml('<div><span>plain</span> text</div>')).toBe('plain text')
  })
  it('keeps safe http(s) links with hardened attributes', () => {
    const out = sanitizeHtml('<a href="https://bitcoin.org" onclick="x()">site</a>')
    expect(out).toContain('href="https://bitcoin.org"')
    expect(out).toContain('rel="noreferrer noopener"')
    expect(out).not.toContain('onclick')
  })
  it('drops scripts and javascript: links', () => {
    const out = sanitizeHtml('<script>alert(1)</script><a href="javascript:alert(1)">bad</a><p>ok</p>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('javascript')
    expect(out).toContain('<p>ok</p>')
  })
  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
