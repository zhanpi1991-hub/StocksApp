import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/services/api'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'
import { Button, Card, CardHeader, Input, Select } from '@/components/ui/primitives'
import { errMsg } from '@/utils/format'

const schema = z.object({
  display_name: z.string().max(80),
  base_currency: z.string().length(3, 'Use a 3-letter code'),
  current_password: z.string().optional(),
  password: z.string().optional(),
}).refine((v) => !v.password || v.password.length >= 8, { path: ['password'], message: 'At least 8 characters' })
  .refine((v) => !v.password || !!v.current_password, { path: ['current_password'], message: 'Required to change password' })

export default function Settings() {
  const { user, setUser } = useAuth()
  const { theme, setTheme } = useUi()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const f = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { display_name: user?.display_name ?? '', base_currency: user?.base_currency ?? 'USD' } })
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Account settings</h1>
      <Card>
        <CardHeader title="Profile &amp; preferences" sub={user?.email} />
        <form className="space-y-3 p-4" onSubmit={f.handleSubmit(async (v) => {
          try {
            const u = await api.updateMe({ display_name: v.display_name, base_currency: v.base_currency, theme, ...(v.password ? { password: v.password, current_password: v.current_password } : {}) })
            setUser(u); setMsg({ ok: true, text: 'Saved.' }); f.reset({ ...v, password: '', current_password: '' })
          } catch (e) { setMsg({ ok: false, text: errMsg(e) }) }
        })}>
          <Input label="Display name" {...f.register('display_name')} />
          <Input label="Base currency" maxLength={3} error={f.formState.errors.base_currency?.message} {...f.register('base_currency')} />
          <Select label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}><option value="dark">Dark</option><option value="light">Light</option></Select>
          <hr className="border-line" />
          <Input label="Current password" type="password" autoComplete="current-password" error={f.formState.errors.current_password?.message} {...f.register('current_password')} />
          <Input label="New password (leave blank to keep)" type="password" autoComplete="new-password" error={f.formState.errors.password?.message} {...f.register('password')} />
          {msg && <p role="status" className={msg.ok ? 'text-xs text-up' : 'text-xs text-down'}>{msg.text}</p>}
          <Button type="submit" variant="primary" disabled={f.formState.isSubmitting}>Save changes</Button>
        </form>
      </Card>
    </div>
  )
}
