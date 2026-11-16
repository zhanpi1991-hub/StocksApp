import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

vi.mock('@/components/charts/PriceChart', () => ({ PriceChart: () => <div data-testid="chart" /> }))
vi.mock('@/hooks/useLive', () => ({ useLiveQuote: () => null, useLiveConnected: () => false, useDebounce: (v: unknown) => v }))
vi.mock('@/services/api', () => {
  const meta = { provider: 'coingecko', status: 'delayed', as_of: null, message: null }
  return {
    api: {
      coin: async () => ({
        meta,
        data: {
          id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: 'https://img.test/btc.png', rank: 1,
          description: 'Bitcoin is <a href="https://bitcoin.org">digital</a> cash.<br>Second line',
          categories: [], homepage: null, genesis_date: null, price: 1, market_cap: 1, volume: 1, high_24h: 1, low_24h: 1,
          ath: 1, atl: 1, fdv: 1, change_1h: 0, change_24h: 0, change_7d: 0, change_30d: 0, change_1y: 0,
          circulating_supply: 1, total_supply: 1, max_supply: 1,
        },
      }),
      coinChart: async () => ({ meta, data: [{ time: 1, value: 1 }, { time: 2, value: 2 }] }),
    },
  }
})

import CryptoDetail from '@/pages/CryptoDetail'

it('renders a coin with an HTML description without crashing', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/crypto/bitcoin']}>
        <Routes>
          <Route path="/crypto/:id" element={<CryptoDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await waitFor(() => expect(screen.getByText(/digital/)).toBeTruthy())
  expect(screen.queryByText('Could not load data')).toBeNull()
  expect(screen.getByRole('link', { name: 'digital' }).getAttribute('href')).toBe('https://bitcoin.org')
})
