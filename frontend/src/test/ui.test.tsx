import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import { RemoteImage } from '@/components/ui/RemoteImage'
import { ArticleList } from '@/components/market/ArticleList'
import { Logo } from '@/components/market/bits'
import { ErrorBoundary } from '@/components/layout/guards'
import { UnavailableState } from '@/components/ui/DataState'
import type { Article } from '@/types/api'

const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

describe('RemoteImage', () => {
  it('shows fallback when src missing', () => {
    render(<RemoteImage src={null} fallback={<span>fb</span>} />)
    expect(screen.getByText('fb')).toBeTruthy()
  })
  it('shows fallback after load error, never a broken image', () => {
    const { container } = render(<RemoteImage src="https://x.test/a.png" fallback={<span>fb</span>} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://x.test/a.png')
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('fb')).toBeTruthy()
  })
  it('rejects non-http(s) URLs', () => {
    const { container } = render(<RemoteImage src="javascript:alert(1)" fallback={<span>fb</span>} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('Logo alternate host', () => {
  it('retries the same CoinGecko asset path on assets.coingecko.com, then falls back to initials', () => {
    const { container } = render(<Logo src="https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1" name="BTC" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1')
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('BT')).toBeTruthy()
  })
})

describe('RemoteImage timeout', () => {
  it('moves on when a host hangs without firing error', () => {
    vi.useFakeTimers()
    const { container } = render(<RemoteImage src="https://a.test/x.png" alternates={['https://b.test/x.png']} timeoutMs={1000} fallback={<span>fb</span>} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://a.test/x.png')
    act(() => { vi.advanceTimersByTime(1100) })
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://b.test/x.png')
    fireEvent.load(container.querySelector('img')!)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://b.test/x.png') // loaded image is kept
    vi.useRealTimers()
  })
})

describe('Logo', () => {
  it('renders provider image, falls back to initials on error', () => {
    const { container } = render(<Logo src="https://img.test/btc.png" name="BTC" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('BT')).toBeTruthy()
  })
})

const art = (o: Partial<Article>): Article => ({ id: '1', headline: 'H', summary: '', source: 'Src', url: 'https://n.test/1', image: null, published_at: null, category: null, related: [], ...o })

describe('ArticleList', () => {
  it('renders thumbnail when image provided and placeholder when not', () => {
    const { container } = render(wrap(<ArticleList items={[art({ id: '1', image: 'https://img.test/1.jpg' }), art({ id: '2', url: 'https://n.test/2', image: null })]} />))
    expect(container.querySelectorAll('img').length).toBe(1)
    expect(container.querySelectorAll('[title="No image provided"]').length).toBe(1)
  })
  it('survives a failing image', () => {
    const { container } = render(wrap(<ArticleList items={[art({ image: 'https://img.test/bad.jpg' })]} />))
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('H')).toBeTruthy()
  })
})

describe('ErrorBoundary', () => {
  it('clears a caught error when resetKey changes', () => {
    const Bomb = ({ boom }: { boom: boolean }) => {
      if (boom) throw new Error('boom')
      return <p>fine</p>
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(wrap(<ErrorBoundary resetKey="/a"><Bomb boom /></ErrorBoundary>))
    expect(screen.getByText('boom')).toBeTruthy()
    rerender(wrap(<ErrorBoundary resetKey="/b"><Bomb boom={false} /></ErrorBoundary>))
    expect(screen.getByText('fine')).toBeTruthy()
  })
})

describe('UnavailableState', () => {
  const meta = (reason: 'no_key' | 'rate_limited') => ({ provider: 'p', status: 'unavailable' as const, as_of: null, message: 'm', reason })
  it('no_key has no retry button; rate_limited does', () => {
    const { unmount } = render(wrap(<UnavailableState meta={meta('no_key')} onRetry={() => {}} />))
    expect(screen.getByText('API key not configured')).toBeTruthy()
    expect(screen.queryByText('Retry')).toBeNull()
    unmount()
    render(wrap(<UnavailableState meta={meta('rate_limited')} onRetry={() => {}} />))
    expect(screen.getByText('Retry')).toBeTruthy()
  })
})
