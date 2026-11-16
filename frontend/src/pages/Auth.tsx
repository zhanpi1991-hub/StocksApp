import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Activity } from 'lucide-react'
import { api } from '@/services/api'
import { useAuth } from '@/store/auth'
import { Button, Card, Input } from '@/components/ui/primitives'
import { errMsg } from '@/utils/format'

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') })
const registerSchema = z.object({
  display_name: z.string().max(80).optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

function Frame({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold"><Activity className="text-accent" size={20} />Stocks<span className="text-accent">App</span></Link>
        <Card className="p-6"><h1 className="mb-4 text-lg font-semibold">{title}</h1>{children}</Card>
        <p className="mt-4 text-center text-xs text-muted">{footer}</p>
      </div>
    </div>
  )
}

export function Login() {
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const setSession = useAuth((s) => s.setSession)
  const [err, setErr] = useState<string | null>(null)
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })
  return (
    <Frame title="Sign in" footer={<>No account? <Link className="text-accent" to="/register">Create one</Link></>}>
      <form className="space-y-3" onSubmit={f.handleSubmit(async (v) => {
        try { const r = await api.login(v); setSession(r.access_token, r.user); nav(from, { replace: true }) } catch (e) { setErr(errMsg(e)) }
      })}>
        <Input label="Email" type="email" autoComplete="email" error={f.formState.errors.email?.message} {...f.register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={f.formState.errors.password?.message} {...f.register('password')} />
        {err && <p role="alert" className="text-xs text-down">{err}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={f.formState.isSubmitting}>Sign in</Button>
      </form>
    </Frame>
  )
}

export function Register() {
  const nav = useNavigate()
  const setSession = useAuth((s) => s.setSession)
  const [err, setErr] = useState<string | null>(null)
  const f = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) })
  return (
    <Frame title="Create account" footer={<>Already registered? <Link className="text-accent" to="/login">Sign in</Link></>}>
      <form className="space-y-3" onSubmit={f.handleSubmit(async (v) => {
        try { const r = await api.register({ email: v.email, password: v.password, display_name: v.display_name }); setSession(r.access_token, r.user); nav('/', { replace: true }) } catch (e) { setErr(errMsg(e)) }
      })}>
        <Input label="Display name (optional)" {...f.register('display_name')} />
        <Input label="Email" type="email" autoComplete="email" error={f.formState.errors.email?.message} {...f.register('email')} />
        <Input label="Password" type="password" autoComplete="new-password" error={f.formState.errors.password?.message} {...f.register('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" error={f.formState.errors.confirm?.message} {...f.register('confirm')} />
        {err && <p role="alert" className="text-xs text-down">{err}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={f.formState.isSubmitting}>Create account</Button>
      </form>
    </Frame>
  )
}
