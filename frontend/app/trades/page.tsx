'use client'

import React, { useState, useEffect } from 'react'

interface Trade {
  _id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  executedAt: string
  executionPrice: number
  notionalValue: number
  isMaker: boolean
  feePaid: number
  fillScore: number
  fillGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  slippageScore: number
  feeScore: number
  timingScore: number
  exchangeScore: number
  slippageBps: number
  spreadBps: number
  arrivalPriceProxy: number
}

interface TradesResponse {
  trades: Trade[]
  total: number
  page: number
  pages: number
}

export default function Trades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userId, setUserId] = useState<string>('')

  const [totalBuys, setTotalBuys] = useState(0)
  const [totalSells, setTotalSells] = useState(0)
  const [totalMakers, setTotalMakers] = useState(0)

  // Filters
  const [symbolFilter, setSymbolFilter] = useState('ALL')
  const [sideFilter, setSideFilter] = useState('ALL')
  const [gradeFilter, setGradeFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('executedAt')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const fetchStats = async (uid: string) => {
    try {
      const res = await fetch(
        `http://localhost:3001/api/trades?userId=${uid}&limit=1000`
      )
      const data = await res.json()
      const all = data.trades as Trade[]
      setTotalBuys(all.filter(t => t.side === 'BUY').length)
      setTotalSells(all.filter(t => t.side === 'SELL').length)
      setTotalMakers(all.filter(t => t.isMaker).length)
    } catch {}
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const uid = params.get('userId') || localStorage.getItem('userId') || ''
    if (!uid) { window.location.href = '/'; return }
    setUserId(uid)
    fetchStats(uid)
  }, [])

  useEffect(() => {
    if (!userId) return
    fetchTrades()
  }, [userId, page, symbolFilter, sideFilter, gradeFilter])

  const fetchTrades = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        userId,
        symbol: symbolFilter,
        side: sideFilter,
        grade: gradeFilter,
        page: String(page),
        limit: '50'
      })
      const res = await fetch(`http://localhost:3001/api/trades?${params}`)
      const data: TradesResponse = await res.json()
      setTrades(data.trades)
      setTotal(data.total)
      setPages(data.pages)
    } catch {
      setTrades([])
    } finally {
      setLoading(false)
    }
  }

  const gradeColor = (g: string) => ({
    A: '#4ade80', B: '#86efac',
    C: '#fcd34d', D: '#f97316', F: '#ef4444'
  }[g] ?? '#888078')

  const scoreColor = (s: number) =>
    s >= 80 ? '#4ade80' : s >= 60 ? '#fcd34d' :
    s >= 40 ? '#f97316' : '#ef4444'

  const formatPrice = (p: number | undefined | null) => {
    if (p == null || isNaN(p)) return '—'
    return p >= 1000
      ? p.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : p.toFixed(4)
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return {
      date: dt.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      }),
      time: dt.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit',
        hour12: false
      })
    }
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const sortedTrades = [...trades].sort((a, b) => {
    let av: number, bv: number
    if (sortBy === 'executedAt') {
      av = new Date(a.executedAt).getTime()
      bv = new Date(b.executedAt).getTime()
    } else if (sortBy === 'fillScore') {
      av = a.fillScore; bv = b.fillScore
    } else if (sortBy === 'notionalValue') {
      av = a.notionalValue; bv = b.notionalValue
    } else if (sortBy === 'slippageBps') {
      av = a.slippageBps; bv = b.slippageBps
    } else {
      av = a.feePaid; bv = b.feePaid
    }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const symbolColor = (sym: string) => {
    if (sym === 'BTCUSDT') return '#f7931a'
    if (sym === 'ETHUSDT') return '#627eea'
    if (sym === 'BNBUSDT') return '#f3ba2f'
    if (sym === 'SOLUSDT') return '#9945ff'
    return '#a09890'
  }


  const avgScore = trades.length
    ? Math.round(trades.reduce((s,t) => s + t.fillScore, 0) / trades.length)
    : 0

  const FilterPill = ({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (v: string) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#888078', marginRight: '6px' }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px',
          fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em',
          color: value !== 'ALL' ? '#c4a882' : '#7a7870',
          padding: '4px 24px 4px 8px', cursor: 'pointer', outline: 'none',
          appearance: 'none', WebkitAppearance: 'none',
        }}
      >
        {options.map(o => (
          <option key={o} value={o} style={{background:'#1c1c1a', color:'#ede8e0'}}>
            {o}
          </option>
        ))}
      </select>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ position: 'absolute', right: '7px', pointerEvents: 'none' }}>
        <path d="M1 2.5l3 3 3-3" stroke="#585852" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    </div>
  )

  const SortableHeader = ({ col, label, align = 'left' }: { col: string, label: string, align?: 'left'|'right'|'center' }) => (
    <div
      onClick={() => handleSort(col)}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em',
        color: sortBy === col ? '#c4a882' : '#888078', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '4px',
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
        userSelect: 'none', transition: 'color 0.15s'
      }}
      onMouseOver={e => { if (sortBy !== col) e.currentTarget.style.color = '#7a7870' }}
      onMouseOut={e => { if (sortBy !== col) e.currentTarget.style.color = '#888078' }}
    >
      {label}
      {sortBy === col && <span style={{fontSize:'0.5rem', opacity:0.7}}>{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </div>
  )

  const currentIndex = selectedTrade ? sortedTrades.findIndex(t => t._id === selectedTrade._id) : -1
  const goToPrev = () => { if (currentIndex > 0) setSelectedTrade(sortedTrades[currentIndex - 1]) }
  const goToNext = () => { if (currentIndex < sortedTrades.length - 1) setSelectedTrade(sortedTrades[currentIndex + 1]) }

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
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#888078',
              cursor: 'pointer', padding: '4px 0'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#c4a882'}
            onMouseOut={e => e.currentTarget.style.color = '#888078'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 6H2M6 2L2 6l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            DASHBOARD
          </button>
          <div style={{width:'1px', height:'20px', background:'rgba(255,255,255,0.1)'}}/>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.3em',
            background: 'linear-gradient(135deg, #a78b71, #c4a882)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>FILLSCORE</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#888078' }}>{total} TRADES</span>
          <span style={{
            padding: '0.3rem 0.7rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px',
            fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.12em', color: '#7a7870',
            background: 'rgba(255,255,255,0.07)', textTransform: 'uppercase'
          }}>BINANCE</span>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={{ padding: '6rem 2rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* SECTION A — Title + Stats */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.75rem', color: '#ede8e0', letterSpacing: '-0.01em' }}>
              Trade History
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#888078', marginTop: '4px' }}>
              January 2024  ·  {total} executions  ·  Binance Spot
            </div>
          </div>
          <div className="hidden md:flex" style={{ gap: '2rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600, color: '#ede8e0' }}>{totalBuys}B / {totalSells}S</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#888078' }}>BUY / SELL</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600, color: scoreColor(avgScore) }}>{avgScore}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#888078' }}>AVG SCORE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600, color: '#c4a882' }}>{totalMakers}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.12em', color: '#888078' }}>MAKER FILLS</span>
            </div>
          </div>
        </div>

        {/* SECTION B — Filter Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem',
          padding: '0.875rem 1.25rem', background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '3px', flexWrap: 'wrap'
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#585450', marginRight: '0.5rem' }}>FILTER</span>
          <FilterPill label="SYMBOL" value={symbolFilter} options={['ALL', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']} onChange={setSymbolFilter} />
          <FilterPill label="SIDE" value={sideFilter} options={['ALL', 'BUY', 'SELL']} onChange={setSideFilter} />
          <FilterPill label="GRADE" value={gradeFilter} options={['ALL', 'A', 'B', 'C', 'D', 'F']} onChange={setGradeFilter} />
          
          {(symbolFilter !== 'ALL' || sideFilter !== 'ALL' || gradeFilter !== 'ALL') && (
            <button
              onClick={() => { setSymbolFilter('ALL'); setSideFilter('ALL'); setGradeFilter('ALL'); setPage(1); }}
              style={{
                marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em',
                color: '#c4a882', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0'
              }}
            >CLEAR FILTERS ×</button>
          )}
        </div>

        {/* SECTION C — Trade Table */}
        <div style={{ background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: 0 }}>
          
          <div className="hidden md:grid" style={{
            gridTemplateColumns: '2rem 7rem 4.5rem 3.5rem 7.5rem 7rem 6rem 5rem 4.5rem 4.5rem 5rem',
            alignItems: 'center', padding: '0 1.25rem', height: '40px', background: '#121210',
            borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: '64px', zIndex: 10
          }}>
            <div></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>TIME</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>SYMBOL</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>SIDE</div>
            <SortableHeader col="notionalValue" label="NOTIONAL" />
            <SortableHeader col="executionPrice" label="PRICE" />
            <SortableHeader col="feePaid" label="FEE" align="right" />
            <SortableHeader col="slippageBps" label="SLIP BPS" align="right" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#888078', textAlign: 'center' }}>ORDER</div>
            <SortableHeader col="fillScore" label="SCORE" align="right" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#888078', textAlign: 'center' }}>GRADE</div>
          </div>

          <div className="grid md:hidden" style={{
            gridTemplateColumns: '2rem 7rem 3.5rem 3.5rem 5rem 4.5rem 5rem',
            alignItems: 'center', padding: '0 1.25rem', height: '40px', background: '#121210',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
             <div></div>
             <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>TIME</div>
             <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>SYM</div>
             <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#585450' }}>SIDE</div>
             <SortableHeader col="executionPrice" label="PRICE" />
             <SortableHeader col="fillScore" label="SCORE" align="right" />
             <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.14em', color: '#888078', textAlign: 'center' }}>GRADE</div>
          </div>

          {loading ? (
            <div>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="grid grid-cols-[2rem_7rem_3.5rem_3.5rem_5rem_4.5rem_5rem] md:grid-cols-[2rem_7rem_4.5rem_3.5rem_7.5rem_7rem_6rem_5rem_4.5rem_4.5rem_5rem]"
                  style={{ alignItems:'center', padding:'0 1.25rem', height:'52px', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{height:'12px', width:'60%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'60%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div className="hidden md:block" style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div className="hidden md:block" style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div className="hidden md:block" style={{height:'12px', width:'70%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div className="hidden md:block" style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'60%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'70%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                  <div style={{height:'12px', width:'80%', borderRadius:'2px', background:'linear-gradient(90deg, #1a1a18 25%, #222220 50%, #1a1a18 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite'}}></div>
                </div>
              ))}
            </div>
          ) : sortedTrades.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '2rem', color: '#585450' }}>◎</div>
              <div style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.1rem', color: '#888078' }}>No trades match your filters</div>
              <button
                onClick={() => { setSymbolFilter('ALL'); setSideFilter('ALL'); setGradeFilter('ALL'); setPage(1); }}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em',
                  color: '#c4a882', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px'
                }}
              >CLEAR FILTERS</button>
            </div>
          ) : (
            <div>
              {sortedTrades.map((trade, i) => {
                const { date, time } = formatDate(trade.executedAt)
                return (
                  <div key={trade._id}
                    onClick={() => { setSelectedTrade(trade); setDrawerOpen(true); }}
                    className="grid grid-cols-[2rem_7rem_3.5rem_3.5rem_5rem_4.5rem_5rem] md:grid-cols-[2rem_7rem_4.5rem_3.5rem_7.5rem_7rem_6rem_5rem_4.5rem_4.5rem_5rem]"
                    style={{
                      alignItems: 'center', padding: '0 1.25rem', height: '52px', borderBottom: '1px solid rgba(255,255,255,0.1)',
                      cursor: 'pointer', transition: 'background 0.12s ease',
                      background: selectedTrade?._id === trade._id ? 'rgba(167,139,113,0.05)' : 'transparent',
                      borderLeft: selectedTrade?._id === trade._id ? '2px solid rgba(167,139,113,0.4)' : '2px solid transparent'
                    }}
                    onMouseOver={e => { if (selectedTrade?._id !== trade._id) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseOut={e => { if (selectedTrade?._id !== trade._id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', color: '#585450' }}>
                      {String((page-1)*50 + i + 1).padStart(3, '0')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#b8b0a6', letterSpacing: '0.04em' }}>{date}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#888078', letterSpacing: '0.04em' }}>{time}</div>
                    </div>
                    <div title={trade.symbol} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', fontWeight: 600, color: symbolColor(trade.symbol) }}>
                      {trade.symbol.replace('USDT', '')}
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '2px', width: 'fit-content',
                      fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', fontWeight: 600,
                      background: trade.side === 'BUY' ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                      color: trade.side === 'BUY' ? '#4ade80' : '#ef4444',
                      border: trade.side === 'BUY' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(239,68,68,0.2)'
                    }}>
                      {trade.side}
                    </div>
                    
                    <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#f0ece4', letterSpacing: '0.02em' }}>
                      ${formatPrice(trade.notionalValue)}
                    </div>
                    <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#b8b0a6' }}>
                      {formatPrice(trade.executionPrice)}
                    </div>
                    
                    {/* Mobile Price */}
                    <div className="block md:hidden" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#f0ece4' }}>
                      {formatPrice(trade.executionPrice)}
                    </div>

                    <div className="hidden md:block" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#888078' }}>
                      {trade.feePaid != null ? `$${trade.feePaid.toFixed(4)}` : '—'}
                    </div>
                    <div className="hidden md:block" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: trade.slippageBps < 2 ? '#4ade80' : trade.slippageBps < 5 ? '#fcd34d' : '#f97316' }}>
                      {trade.slippageBps?.toFixed(1) ?? '—'}
                    </div>
                    <div className="hidden md:block" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: trade.isMaker ? '#c4a882' : '#888078' }}>
                      {trade.isMaker ? 'MAKER' : 'TAKER'}
                    </div>

                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600, color: scoreColor(trade.fillScore) }}>
                      {trade.fillScore != null ? Math.round(trade.fillScore) : '—'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <div style={{
                        width: '28px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '2px', border: `1px solid ${gradeColor(trade.fillGrade)}25`, background: `${gradeColor(trade.fillGrade)}0d`,
                        fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: gradeColor(trade.fillGrade)
                      }}>
                        {trade.fillGrade}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* SECTION D — Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#121210' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#888078' }}>
              Showing {Math.min((page-1)*50 + 1, total)}–{Math.min(page*50, total)} of {total}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[...Array(pages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i+1)}
                  style={{
                    width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: page === i+1 ? 'rgba(167,139,113,0.15)' : 'transparent',
                    border: page === i+1 ? '1px solid rgba(167,139,113,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                    color: page === i+1 ? '#c4a882' : '#888078', cursor: 'pointer'
                  }}
                >{i+1}</button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* SECTION E — Slide-over Drawer */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 200, transition: 'opacity 0.2s ease' }} />
      )}
      
      <div className="w-[100vw] md:w-[420px]" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        background: '#1a1917', borderLeft: '1px solid rgba(255,255,255,0.08)', zIndex: 201,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {selectedTrade && (
          <>
            <div style={{ padding: '1.5rem 1.5rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.08em', color: symbolColor(selectedTrade.symbol) }}>
                  {selectedTrade.symbol}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '6px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '2px',
                    fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', fontWeight: 600,
                    background: selectedTrade.side === 'BUY' ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
                    color: selectedTrade.side === 'BUY' ? '#4ade80' : '#ef4444',
                    border: selectedTrade.side === 'BUY' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(239,68,68,0.2)'
                  }}>{selectedTrade.side}</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', padding: '2px 7px', borderRadius: '2px',
                    color: selectedTrade.isMaker ? '#c4a882' : '#888078', border: selectedTrade.isMaker ? '1px solid rgba(167,139,113,0.3)' : '1px solid rgba(255,255,255,0.08)'
                  }}>{selectedTrade.isMaker ? 'MAKER' : 'TAKER'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: '#888078', marginLeft: 'auto' }}>
                    {formatDate(selectedTrade.executedAt).date} {formatDate(selectedTrade.executedAt).time}
                  </div>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{
                width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px', cursor: 'pointer', color: '#888078'
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '4rem', lineHeight: 1, color: gradeColor(selectedTrade.fillGrade), filter: `drop-shadow(0 0 20px ${gradeColor(selectedTrade.fillGrade)}40)` }}>
                {selectedTrade.fillGrade}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '2rem', color: scoreColor(selectedTrade.fillScore) }}>
                  {Math.round(selectedTrade.fillScore)}<span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#888078', marginLeft: '2px' }}>/100</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#888078' }}>FILL SCORE</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.2em', color: '#585450', margin: '0 0 0.875rem 2px' }}>
                EXECUTION DETAILS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                {[
                  { label: "QUANTITY", value: selectedTrade.quantity?.toFixed(6) ?? '—' },
                  { label: "EXEC PRICE", value: `$${formatPrice(selectedTrade.executionPrice)}` },
                  { label: "ARRIVAL PRICE", value: `$${formatPrice(selectedTrade.arrivalPriceProxy)}` },
                  { label: "NOTIONAL", value: selectedTrade.notionalValue != null ? `$${selectedTrade.notionalValue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—' },
                  { label: "FEE PAID", value: selectedTrade.feePaid != null ? `$${selectedTrade.feePaid.toFixed(4)}` : '—' },
                  { label: "SPREAD", value: `${selectedTrade.spreadBps?.toFixed(1) ?? '—'} bps` },
                  { label: "SLIPPAGE", value: <span style={{color: selectedTrade.slippageBps < 2 ? '#4ade80' : selectedTrade.slippageBps < 5 ? '#fcd34d' : '#f97316'}}>{selectedTrade.slippageBps?.toFixed(2) ?? '—'} bps</span> },
                  { label: "ORDER TYPE", value: <span style={{color: selectedTrade.isMaker ? '#c4a882' : '#888078'}}>{selectedTrade.isMaker ? 'MAKER' : 'TAKER'}</span> }
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', borderBottom: i === 7 ? 'none' : '1px solid rgba(255,255,255,0.07)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#888078' }}>{row.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#f0ece4', textAlign: 'right' }}>{row.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.2em', color: '#585450', margin: '1.25rem 0 0.875rem 2px' }}>
                SCORE BREAKDOWN
              </div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                 {[
                   { label: "SLIPPAGE", score: selectedTrade.slippageScore },
                   { label: "FEES", score: selectedTrade.feeScore },
                   { label: "TIMING", score: selectedTrade.timingScore },
                   { label: "SPREAD", score: selectedTrade.exchangeScore }
                 ].map(bar => (
                   <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                     <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: '#888078', width: '80px', flexShrink: 0 }}>{bar.label}</div>
                     <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                       <div style={{ height: '100%', width: `${bar.score ?? 0}%`, background: scoreColor(bar.score), borderRadius: '2px' }} />
                     </div>
                     <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: scoreColor(bar.score), width: '24px', textAlign: 'right', flexShrink: 0 }}>{Math.round(bar.score)}</div>
                   </div>
                 ))}
               </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.1em', color: '#585450' }}>
                TRADE ID  ·  {selectedTrade._id.slice(-8).toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={goToPrev} disabled={currentIndex <= 0} style={{
                  width: '28px', height: '28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px', cursor: currentIndex <= 0 ? 'default' : 'pointer',
                  color: '#888078', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: currentIndex <= 0 ? 0.3 : 1
                }}>←</button>
                <button onClick={goToNext} disabled={currentIndex >= sortedTrades.length - 1} style={{
                  width: '28px', height: '28px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px', cursor: currentIndex >= sortedTrades.length - 1 ? 'default' : 'pointer',
                  color: '#888078', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: currentIndex >= sortedTrades.length - 1 ? 0.3 : 1
                }}>→</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
