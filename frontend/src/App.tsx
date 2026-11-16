import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary, ProtectedRoute } from '@/components/layout/guards'
import { SkeletonRows } from '@/components/ui/primitives'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Stocks = lazy(() => import('@/pages/Stocks'))
const StockDetail = lazy(() => import('@/pages/StockDetail'))
const Crypto = lazy(() => import('@/pages/Crypto'))
const CryptoDetail = lazy(() => import('@/pages/CryptoDetail'))
const Forex = lazy(() => import('@/pages/Forex'))
const News = lazy(() => import('@/pages/News'))
const Screener = lazy(() => import('@/pages/Screener'))
const Compare = lazy(() => import('@/pages/Compare'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Ipos = lazy(() => import('@/pages/Ipos'))
const Watchlists = lazy(() => import('@/pages/Watchlists'))
const Portfolio = lazy(() => import('@/pages/Portfolio'))
const Alerts = lazy(() => import('@/pages/Alerts'))
const Status = lazy(() => import('@/pages/Status'))
const Settings = lazy(() => import('@/pages/Settings'))
const { Login, Register } = {
  Login: lazy(() => import('@/pages/Auth').then((m) => ({ default: m.Login }))),
  Register: lazy(() => import('@/pages/Auth').then((m) => ({ default: m.Register }))),
}
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SkeletonRows rows={8} />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="stocks" element={<Stocks />} />
            <Route path="stocks/:symbol" element={<StockDetail />} />
            <Route path="crypto" element={<Crypto />} />
            <Route path="crypto/:id" element={<CryptoDetail />} />
            <Route path="forex" element={<Forex />} />
            <Route path="news" element={<News />} />
            <Route path="screener" element={<Screener />} />
            <Route path="compare" element={<Compare />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="ipos" element={<Ipos />} />
            <Route path="status" element={<Status />} />
            <Route element={<ProtectedRoute />}>
              <Route path="watchlists" element={<Watchlists />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
