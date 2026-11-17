import { Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LinePoint } from '@/types/api'

const PALETTE = ['#d6b66c', '#8fa6c4', '#5fa8a0', '#a58ab8', '#c98b5b', '#a89f91']

export function AllocationPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} stroke="var(--surface)">
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} formatter={(v) => Number(v).toLocaleString()} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function CompareLines({ series }: { series: { name: string; points: LinePoint[] }[] }) {
  const byTime = new Map<string, Record<string, number | string>>()
  for (const s of series)
    for (const p of s.points) {
      const k = String(p.time)
      byTime.set(k, { ...(byTime.get(k) ?? { time: k }), [s.name]: p.value })
    }
  const rows = [...byTime.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows}>
        <XAxis dataKey="time" tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={40} />
        <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} domain={['auto', 'auto']} width={44} />
        <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} formatter={(v) => Number(v).toFixed(2)} />
        <Legend />
        {series.map((s, i) => (
          <Line key={s.name} dataKey={s.name} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={2} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
