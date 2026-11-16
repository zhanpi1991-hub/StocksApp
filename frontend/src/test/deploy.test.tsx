import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries(env)) if (v !== undefined) vi.stubEnv(k, v)
  return import('@/services/config')
}

describe('API / WebSocket URL configuration', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defaults to same-origin /api (dev server, nginx)', async () => {
    const c = await loadConfig({})
    expect(c.API_BASE).toBe('/api')
    expect(c.wsUrl()).toBe(`ws://${location.host}/api/ws`)
  })

  it('uses VITE_API_URL (trailing slash trimmed) and derives wss:// from https', async () => {
    const c = await loadConfig({ VITE_API_URL: 'https://stocksapp-api.onrender.com/api/' })
    expect(c.API_BASE).toBe('https://stocksapp-api.onrender.com/api')
    expect(c.wsUrl()).toBe('wss://stocksapp-api.onrender.com/api/ws')
  })

  it('lets VITE_WS_URL override the derived URL', async () => {
    const c = await loadConfig({ VITE_API_URL: 'https://a.example/api', VITE_WS_URL: 'wss://b.example/ws' })
    expect(c.wsUrl()).toBe('wss://b.example/ws')
  })
})

describe('ApiBanner', () => {
  it('shows when the API is unreachable and hides when healthy', async () => {
    vi.resetModules()
    vi.doMock('@/services/api', () => ({ api: { health: async () => { throw new Error('Network Error') } } }))
    const { ApiBanner } = await import('@/components/layout/ApiBanner')
    const wrap = () => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApiBanner /></QueryClientProvider>
    const bad = render(wrap())
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 5000 }) // component retries once before showing
    expect(screen.getByText(/Cannot reach the StocksApp API/)).toBeTruthy()
    bad.unmount()

    vi.resetModules()
    vi.doMock('@/services/api', () => ({ api: { health: async () => ({ status: 'ok' }) } }))
    const mod = await import('@/components/layout/ApiBanner')
    const good = render(<QueryClientProvider client={new QueryClient()}><mod.ApiBanner /></QueryClientProvider>)
    await new Promise((r) => setTimeout(r, 50))
    expect(good.container.querySelector('[role="alert"]')).toBeNull()
  })

  it('treats an HTML response (static host returning index.html for /api) as unreachable', async () => {
    vi.resetModules()
    vi.doMock('@/services/api', () => ({ api: { health: async () => '<!doctype html><html></html>' } }))
    const { ApiBanner } = await import('@/components/layout/ApiBanner')
    render(<QueryClientProvider client={new QueryClient()}><ApiBanner /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})
