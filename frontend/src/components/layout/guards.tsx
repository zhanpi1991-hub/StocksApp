import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { ErrorState } from '@/components/ui/DataState'

export function ProtectedRoute() {
  const token = useAuth((s) => s.token)
  const loc = useLocation()
  return token ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc.pathname }} />
}

interface Props {
  children: ReactNode
  /** When this value changes (e.g. the route), a previously caught error is cleared. */
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: Props) {
    // Without this, one crashed page leaves every later route showing the same error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack)
  }
  render() {
    if (this.state.error) return <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

/** Route-aware boundary: resets on navigation. */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}
