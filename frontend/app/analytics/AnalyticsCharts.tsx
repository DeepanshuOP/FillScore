'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { hueCss, hueShare } from '../ui/hue'

/** The analytics charts, in one module so the page can lazy-load recharts. One data hue (the measured colour), deeper for larger. */
const AXIS = { fill: 'var(--ui-graphite)', fontSize: 11 }
const TOOLTIP = { backgroundColor: 'var(--ui-overlay)', border: '1px solid var(--ui-rule)', color: 'var(--ui-ink)', borderRadius: '10px', fontSize: 13 }
const CURSOR = { fill: 'var(--ui-overlay)' }

export interface GradeCount { grade: string; count: number }
export interface BucketCount { bucket: string; count: number }
export interface HourScore { hour: number; avgScore: number; count: number }

export function ScoreDistributionChart({ data }: { data: GradeCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="grade" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--ui-rule)' }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={CURSOR} contentStyle={TOOLTIP} itemStyle={{ color: 'var(--ui-ink)' }} formatter={(value: unknown) => [`${String(value)} trades`, 'Count']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => <Cell key={i} fill={hueCss(hueShare(d.count / max))} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SlippageChart({ data }: { data: BucketCount[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--ui-rule)' }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={CURSOR} contentStyle={TOOLTIP} itemStyle={{ color: 'var(--ui-ink)' }} formatter={(value: unknown) => [`${String(value)} trades`, 'Count']} />
        <Bar dataKey="count" fill={hueCss(100)} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function HourlyChart({ data }: { data: HourScore[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--ui-rule)' }} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={CURSOR}
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null
            const item = payload[0].payload as HourScore
            return (
              <div className="rounded-[10px] bg-ui-overlay p-3 text-[13px] text-ui-graphite ring-1 ring-inset ring-ui-rule">
                <div className="mb-1 text-ui-ink">{item.hour.toString().padStart(2, '0')}:00 UTC</div>
                <div>Average score <span className="font-semibold text-ui-ink">{item.avgScore}</span></div>
                <div>{item.count} trades</div>
              </div>
            )
          }}
        />
        <ReferenceLine y={75} stroke="var(--ui-graphite)" strokeDasharray="3 3" />
        <Bar dataKey="avgScore" radius={[4, 4, 0, 0]} maxBarSize={20}>
          {data.map((d, i) => <Cell key={i} fill={hueCss(hueShare(d.avgScore / 100))} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
