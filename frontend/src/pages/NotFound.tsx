import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/primitives'

export default function NotFound() {
  return (
    <Card className="p-10 text-center">
      <p className="num text-4xl font-semibold text-accent">404</p>
      <p className="mt-2 text-muted">This page does not exist.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-accent">Back to overview</Link>
    </Card>
  )
}
