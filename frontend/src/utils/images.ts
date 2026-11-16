/**
 * CoinGecko returns logo URLs on coin-images.coingecko.com. The identical path is also served from
 * assets.coingecko.com, which is used as a second attempt when the first host is blocked or unreachable
 * (some networks/firewalls block the CDN host). Nothing is invented: the path is the provider's own.
 */
export function coinImageAlternates(url: string | null | undefined): string[] {
  if (!url) return []
  try {
    const u = new URL(url)
    if (u.hostname === 'coin-images.coingecko.com') {
      u.hostname = 'assets.coingecko.com'
      return [u.toString()]
    }
  } catch {
    /* not a URL */
  }
  return []
}
