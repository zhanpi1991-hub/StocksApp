import { useEffect, useRef } from 'react'
import { AreaSeries, CandlestickSeries, ColorType, createChart, type IChartApi, type Time } from 'lightweight-charts'
import type { Candle, LinePoint } from '@/types/api'
import { useUi } from '@/store/ui'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

type Props = { height?: number; mode: 'line'; points: LinePoint[] } | { height?: number; mode: 'candle'; candles: Candle[] }

/** TradingView Lightweight Charts wrapper (line/area or candlesticks). Re-themes on theme change. */
export function PriceChart(props: Props) {
  const el = useRef<HTMLDivElement>(null)
  const theme = useUi((s) => s.theme)
  const height = props.height ?? 360

  useEffect(() => {
    if (!el.current) return
    const up = cssVar('--up')
    const down = cssVar('--down')
    const chart: IChartApi = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: 'Inter, sans-serif' },
      grid: { vertLines: { color: cssVar('--line') }, horzLines: { color: cssVar('--line') } },
      rightPriceScale: { borderColor: cssVar('--line') },
      timeScale: { borderColor: cssVar('--line'), timeVisible: true },
      crosshair: { mode: 0 },
    })

    if (props.mode === 'candle') {
      const s = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down })
      s.setData(dedupe(props.candles).map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })))
    } else {
      const pts = dedupe(props.points)
      const rising = pts.length < 2 || pts[pts.length - 1].value >= pts[0].value
      const color = rising ? up : down
      const s = chart.addSeries(AreaSeries, { lineColor: color, topColor: color + '40', bottomColor: color + '00', lineWidth: 2 })
      s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })))
    }
    chart.timeScale().fitContent()
    return () => chart.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, theme, height])

  return <div ref={el} style={{ height }} className="w-full" role="img" aria-label="Price chart" />
}

function dedupe<T extends { time: number | string }>(arr: T[]): T[] {
  const seen = new Set<number | string>()
  return arr.filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true))).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
}
