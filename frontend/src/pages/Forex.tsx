import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { api } from '@/services/api'
import { Card, CardHeader, IconButton, Input, Segmented, Select, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { AlertButton, Change, WatchButton } from '@/components/market/bits'
import { PriceChart } from '@/components/charts/PriceChart'
import { fmtNum, fmtPrice } from '@/utils/format'

const MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'KZT']
const RANGES = ['1M', '3M', '6M', '1Y', '5Y'] as const

export default function Forex() {
  const [sp, setSp] = useSearchParams()
  const [base, quote] = (sp.get('pair') ?? 'EUR/USD').toUpperCase().split('/')
  const [amount, setAmount] = useState('100')
  const [range, setRange] = useState<(typeof RANGES)[number]>('3M')
  const cur = useQuery({ queryKey: ['currencies'], queryFn: api.currencies, staleTime: 3600_000 })
  const codes = cur.data?.data?.map((c) => c.code) ?? MAJORS
  const setPair = (b: string, q: string) => setSp({ pair: `${b}/${q}` }, { replace: true })

  const pair = useQuery({ queryKey: ['fx-pair', base, quote], queryFn: () => api.fxPair(base, quote), enabled: !!base && !!quote && base !== quote })
  const hist = useQuery({ queryKey: ['fx-hist', base, quote, range], queryFn: () => api.fxHistory(base, quote, range), enabled: !!base && !!quote && base !== quote })
  const amt = Number(amount)
  const conv = useQuery({ queryKey: ['fx-conv', base, quote, amt], queryFn: () => api.fxConvert(base, quote, amt), enabled: amt > 0 && base !== quote })
  const matrix = useQuery({ queryKey: ['fx-matrix', base], queryFn: () => api.fxRates(base, MAJORS.join(',')) })

  useEffect(() => { if (!sp.get('pair')) setPair('EUR', 'USD') }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Forex &amp; currencies</h1>
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Base currency" value={base} onChange={(e) => setPair(e.target.value, quote)} className="w-40">{codes.map((c) => <option key={c}>{c}</option>)}</Select>
          <IconButton label="Swap currencies" onClick={() => setPair(quote, base)}><ArrowLeftRight size={16} /></IconButton>
          <Select label="Quote currency" value={quote} onChange={(e) => setPair(base, e.target.value)} className="w-40">{codes.map((c) => <option key={c}>{c}</option>)}</Select>
          <div className="ml-auto flex"><WatchButton assetType="forex" symbol={`${base}/${quote}`} /><AlertButton assetType="forex" symbol={`${base}/${quote}`} /></div>
        </div>
      </Card>

      {base === quote ? <Card className="p-6 text-center text-sm text-muted">Choose two different currencies.</Card> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title={`${base}/${quote}`} right={<Segmented label="Chart range" options={RANGES} value={range} onChange={setRange} />} />
            <EnvelopeView query={pair} footer={false}>
              {(d) => <div className="flex flex-wrap items-end gap-4 px-4 pt-4"><span className="num text-3xl font-semibold">{fmtPrice(d.rate, 4)}</span><Change v={d.change_pct} className="text-lg" /><span className="text-xs text-muted">Reference rate for {d.date}; change vs previous fixing</span></div>}
            </EnvelopeView>
            <EnvelopeView query={hist} isEmpty={(d) => d.length === 0}>{(pts) => <div className="p-2"><PriceChart mode="line" points={pts} height={320} /></div>}</EnvelopeView>
          </Card>
          <Card>
            <CardHeader title="Converter" />
            <div className="space-y-3 p-4">
              <Input label={`Amount (${base})`} type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <EnvelopeView query={conv} footer>
                {(d) => <div><p className="text-xs text-muted">{fmtNum(d.amount, 2)} {base} =</p><p className="num text-2xl font-semibold">{fmtNum(d.result, 4)} {quote}</p><p className="text-xs text-muted">1 {base} = {fmtPrice(d.rate, 4)} {quote} ({d.date})</p></div>}
              </EnvelopeView>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title={`1 ${base} in major currencies`} />
        <EnvelopeView query={matrix} isEmpty={(d) => Object.keys(d.rates).length === 0}>
          {(d) => <Table><thead><tr><th className={th}>Currency</th><th className={th + ' text-right'}>Rate</th><th className={th}>Fixing date</th></tr></thead>
            <tbody>{Object.entries(d.rates).map(([k, v]) => <tr key={k} className="cursor-pointer hover:bg-surface-2/50" onClick={() => setPair(base, k)}><td className={td + ' font-medium'}>{base}/{k}</td><td className={td + ' num text-right'}>{fmtPrice(v.rate, 4)}</td><td className={td + ' text-muted'}>{v.date}</td></tr>)}</tbody></Table>}
        </EnvelopeView>
      </Card>
    </div>
  )
}
