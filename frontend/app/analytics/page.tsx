'use client'

import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  ScatterChart, Scatter, ZAxis
} from 'recharts'

// TYPES:
interface HeatmapCell {
  day: number; hour: number
  count: number; avgScore: number
}
interface SymbolData {
  symbol: string; count: number
  avgScore: number; totalNotional: number
  totalFees: number; makerRatio: number
}
interface DistributionBar {
  grade: string; count: number
}
interface HourlyScore {
  hour: number; avgScore: number; count: number
}
interface AnalyticsData {
  heatmapData: HeatmapCell[]
  symbolBreakdown: SymbolData[]
  scoreDistribution: DistributionBar[]
  hourlyScores: HourlyScore[]
  totalTrades: number
}

const HEATMAP_X = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const uid = params.get('userId') || localStorage.getItem('userId') || ''
    if (!uid) { window.location.href = '/'; return; }
    setUserId(uid)
  }, [])

  useEffect(() => {
    if (!userId) return
    const fetchAnalytics = async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/analytics?userId=${userId}`)
        if (res.ok) {
           const json = await res.json()
           setData(json)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [userId])

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base, #0f0f0f)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.2em', color: '#585450' }}>LOADING ANALYTICS...</div>
      </div>
    )
  }

  const formatPrice = (v: number) => `$${v.toLocaleString('en-US', {maximumFractionDigits:2})}`

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0f0f0f)', color: 'var(--text-primary, #ede8e0)', fontFamily: 'var(--font-inter)' }}>
      {/* HEADER */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '64px',
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem'
      }}>
        <div style={{display:'flex', alignItems:'center', gap:'1.5rem'}}>
          <button onClick={() => window.location.href=`/dashboard?userId=${userId}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#888078', cursor: 'pointer' }}
          >
            ← DASHBOARD
          </button>
          <div style={{width:'1px', height:'20px', background:'rgba(255,255,255,0.06)'}}/>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.3em', color: '#c4a882' }}>ANALYTICS</div>
        </div>
      </header>

      <main style={{ padding: '6rem 2rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '2.2rem', color: '#f0ece4' }}>Execution Intelligence</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#888078', marginTop: '6px' }}>Deep dive into {data.totalTrades} algorithmic fills.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
          
          {/* SYMBOL PERFORMANCE BREAKDOWN */}
          <div style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#888078', marginBottom: '1.5rem' }}>SYMBOL BREAKDOWN</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data.symbolBreakdown.map(s => (
                <div key={s.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#f0ece4', fontWeight: 600 }}>{s.symbol}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#585450', marginTop: '4px' }}>{s.count} TRADES · {s.makerRatio}% MAKER</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: s.avgScore >= 80 ? '#4ade80' : s.avgScore >= 60 ? '#fcd34d' : '#ef4444', fontWeight: 600 }}>{s.avgScore} <span style={{fontSize: '0.5rem', color: '#888078'}}>AVG</span></div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#888078', marginTop: '4px' }}>VOL: {formatPrice(s.totalNotional)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DISTRIBUTION BUCKETS */}
          <div style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', padding: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#888078', marginBottom: '1.5rem' }}>SCORE DISTRIBUTION</h2>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.scoreDistribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="grade" stroke="#585450" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#585450" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.04)'}}
                    contentStyle={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#b8b0a6' }} 
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {data.scoreDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={
                        entry.grade.includes('A') ? '#4ade80' : 
                        entry.grade.includes('B') ? '#86efac' : 
                        entry.grade.includes('C') ? '#fcd34d' : 
                        entry.grade.includes('D') ? '#f97316' : '#ef4444'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 24x7 HEATMAP */}
        <div style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#888078' }}>EXECUTION HEATMAP (24×7)</h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: '#585450' }}>Larger circles = Higher Frequency · Green = Better Score</div>
          </div>
          
          <div style={{ height: '240px', width: '100%', overflowX: 'auto' }}>
            <div style={{ minWidth: '700px', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                  <XAxis dataKey="hour" type="number" data={data.heatmapData} name="Hour" unit=":00" domain={[0, 23]} tickCount={24} stroke="#585450" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="day" type="number" data={data.heatmapData} name="Day" tickFormatter={(v) => HEATMAP_X[v]} domain={[0, 6]} tickCount={7} stroke="#585450" fontSize={10} tickLine={false} axisLine={false} reversed />
                  <ZAxis dataKey="count" type="number" range={[10, 300]} name="Trades" />
                  <Tooltip 
                    cursor={{strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)'}}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as HeatmapCell;
                        return (
                          <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>
                            <div style={{ color: '#b8b0a6', fontSize: '0.7rem' }}>{HEATMAP_X[d.day]} {d.hour}:00</div>
                            <div style={{ color: '#888078', fontSize: '0.6rem', marginTop: '4px' }}>Trades: <span style={{ color: '#f0ece4' }}>{d.count}</span></div>
                            <div style={{ color: '#888078', fontSize: '0.6rem' }}>Avg Score: <span style={{ color: d.avgScore >= 80 ? '#4ade80' : '#fcd34d' }}>{d.avgScore}</span></div>
                          </div>
                        )
                      }
                      return null;
                    }}
                  />
                  <Scatter data={data.heatmapData.filter(d=>d.count>0)} shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const scale = Math.min(25, 6 + (payload.count * 1.5));
                    const color = payload.avgScore >= 85 ? '#4ade80' : payload.avgScore >= 70 ? '#fcd34d' : payload.avgScore >= 50 ? '#f97316' : '#ef4444';
                    return <circle cx={cx} cy={cy} r={scale/2} fill={color} fillOpacity={0.6} />
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
