'use client';

import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

interface AuditBreakdown {
  avgSlippageBps: number;
  avgFeeDragBps: number;
  makerRatio: number;
  bestHour: number;
  worstHour: number;
  bestSymbol: string;
  worstSymbol: string;
}

interface AuditSummary {
  userId: string;
  period: { start: string; end: string };
  exchange: string;
  totalTrades: number;
  totalNotional: number;
  avgFillScore: number;
  fillGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  estimatedLossUSD: number;
  breakdown: AuditBreakdown;
  recommendations: string[];
  createdAt: string;
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(val);

const formatNumber = (val: number) =>
  new Intl.NumberFormat('en-US').format(Math.round(val));

const formatPeriod = (start: string, end: string) => {
  const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} — ${e}`;
};

const gradeConfig = {
  A: { color: '#4ade80', glow: 'rgba(74,222,128,0.25)', label: 'Excellent' },
  B: { color: '#86efac', glow: 'rgba(134,239,172,0.2)', label: 'Good' },
  C: { color: '#fcd34d', glow: 'rgba(252,211,77,0.2)', label: 'Average' },
  D: { color: '#f97316', glow: 'rgba(249,115,22,0.2)', label: 'Poor' },
  F: { color: '#ef4444', glow: 'rgba(239,68,68,0.2)',  label: 'Critical' },
};

const generateTrendData = (currentScore: number) => {
  const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
  const variance = [-12, -8, -5, -2, -1, 0];
  return months.map((month, i) => ({
    month,
    score: Math.min(100, Math.max(0, Math.round(currentScore + variance[i]))),
    isCurrent: i === months.length - 1
  }));
};

const getScoreColor = (score: number) => {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#fcd34d';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const getScoreLabel = (score: number) => {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Average';
  if (score >= 40) return 'Poor';
  return 'Critical';
};

const getIcon = (text: string) => {
  if (text.toLowerCase().includes('limit order') ||
      text.toLowerCase().includes('maker')) return '◈';
  if (text.toLowerCase().includes('hour') ||
      text.toLowerCase().includes('utc') ||
      text.toLowerCase().includes('timing')) return '◷';
  if (text.toLowerCase().includes('slippage')) return '◬';
  if (text.toLowerCase().includes('symbol') ||
      text.toLowerCase().includes('best')) return '◎';
  if (text.toLowerCase().includes('cost') ||
      text.toLowerCase().includes('loss') ||
      text.toLowerCase().includes('save')) return '◐';
  return '◆';
};

const highlightDollars = (text: string) => {
  const parts = text.split(/(\$[\d,]+(?:\.\d{2})?)/g);
  return parts.map((part, i) =>
    part.match(/^\$[\d,]+/) ? (
      <span key={i} style={{
        color: '#4ade80',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem'
      }}>{part}</span>
    ) : part
  );
};

const SkeletonBlock = ({ width = '100%', height = '1rem', borderRadius = '2px' }: {
  width?: string;
  height?: string;
  borderRadius?: string;
}) => (
  <div style={{
    width, height, borderRadius,
    background: 'linear-gradient(90deg, #1a1917 25%, #201f1d 50%, #1a1917 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  }}/>
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  return (
    <div style={{
      background: '#1c1c1a',
      border: '1px solid rgba(167,139,113,0.25)',
      borderRadius: '3px',
      padding: '0.625rem 0.875rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#6a6560', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.1rem', fontWeight: 700, color: getScoreColor(score), letterSpacing: '-0.02em' }}>
        {score}
        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: '#6a6560', marginLeft: '4px', fontWeight: 400 }}>/100</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [barsVisible, setBarsVisible] = useState(false);

  useEffect(() => {
    if (audit) {
      const timer = setTimeout(() => setBarsVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [audit]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('userId') || localStorage.getItem('userId');
    
    if (!id) {
      window.location.href = '/';
      return;
    }
    
    setUserId(id);
    localStorage.setItem('userId', id);
    
    const fetchAudit = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/score?userId=${id}`
        );
        if (!res.ok) throw new Error('Failed to fetch audit data');
        const data = await res.json();
        setAudit(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAudit();
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base, #0f0f0f)',
      color: 'var(--text-primary, #ede8e0)',
      fontFamily: 'var(--font-inter)',
      paddingBottom: '4rem'
    }}>
      
      {/* FIXED HEADER */}
      <header style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 100,
        padding: '1.25rem 2.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.04)'
      }}>
        {/* Left side — Logo lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9rem',
            letterSpacing: '0.38em',
            background: 'linear-gradient(135deg, #a78b71 0%, #e8d5b7 45%, #c4a882 70%, #a78b71 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            FILLSCORE
          </span>
          <div className="hidden sm:block" style={{
            width: '1px',
            height: '14px',
            background: 'rgba(167,139,113,0.25)',
            margin: '0 4px'
          }} />
          <span className="hidden sm:inline-block" style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.55rem',
            letterSpacing: '0.15em',
            color: '#8a7060',
            padding: '2px 6px',
            border: '1px solid rgba(167,139,113,0.15)',
            borderRadius: '2px'
          }}>
            v0.9 beta
          </span>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}>
          
          {/* Item 1 — Last analysed date */}
          <span className="hidden sm:inline-block" style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            color: '#888078'
          }}>
            LAST ANALYSED  ·  {loading ? '—' : formatDate(audit?.createdAt)}
          </span>

          {/* Item 2 — Re-analyse button */}
          <button 
            onClick={() => window.location.href = '/'}
            style={{
              padding: '0.4rem 0.875rem',
              border: '1px solid rgba(167,139,113,0.2)',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              color: 'var(--gold, #a78b71)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(167,139,113,0.06)';
              e.currentTarget.style.borderColor = 'rgba(167,139,113,0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(167,139,113,0.2)';
            }}
          >
            RE-ANALYSE
          </button>

          {/* Item 3 — Exchange badge */}
          <span style={{
            padding: '0.3rem 0.7rem',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '2px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.58rem',
            letterSpacing: '0.12em',
            color: '#888078',
            background: 'rgba(255,255,255,0.02)',
            textTransform: 'uppercase'
          }}>
            {loading ? '—' : (audit?.exchange ?? '—')}
          </span>

        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '7rem 2rem 2rem'
      }}>

        {/* SKELETON LOADER */}
        {loading && (
          <div>
            {/* Hero skeleton */}
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
              <SkeletonBlock width="200px" height="200px" borderRadius="4px"/>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <SkeletonBlock width="60%" height="2.5rem"/>
                <SkeletonBlock width="40%" height="1.25rem"/>
                <SkeletonBlock width="80%" height="1.25rem"/>
              </div>
            </div>
            {/* Score bars skeleton */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
              {[1,2,3,4].map(i => <SkeletonBlock key={i} height="100px" borderRadius="3px"/>)}
            </div>
            {/* Recommendations skeleton */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {[1,2,3].map(i => <SkeletonBlock key={i} height="72px" borderRadius="3px"/>)}
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && !loading && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: '60vh', gap: '1.5rem', textAlign: 'center'
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '1px solid rgba(192,57,43,0.3)',
              background: 'rgba(192,57,43,0.07)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>⚠</div>
            
            <div>
              <p style={{
                fontFamily: 'var(--font-playfair)', fontStyle: 'italic',
                fontSize: '1.2rem', color: 'var(--text-primary)',
                marginBottom: '0.5rem'
              }}>Unable to load your data</p>
              <p style={{
                fontFamily: 'var(--font-inter)', fontSize: '0.82rem',
                color: 'var(--text-tertiary)', maxWidth: '320px'
              }}>{error}</p>
            </div>
            
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.6rem 1.5rem',
                border: '1px solid rgba(167,139,113,0.3)',
                borderRadius: '2px', background: 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                letterSpacing: '0.15em', color: 'var(--gold)',
                cursor: 'pointer'
              }}
            >RETRY</button>
          </div>
        )}

        {/* NO DATA STATE */}
        {!audit && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <p style={{
              fontFamily: 'var(--font-playfair)', fontStyle: 'italic',
              fontSize: '1.1rem', color: 'var(--text-secondary)',
              marginBottom: '1rem'
            }}>No audit data found.</p>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              color: 'var(--text-ghost)', letterSpacing: '0.1em'
            }}>Run an analysis from the home page first.</p>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                marginTop: '1.5rem', padding: '0.6rem 1.5rem',
                border: '1px solid rgba(167,139,113,0.3)',
                borderRadius: '2px', background: 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                letterSpacing: '0.15em', color: 'var(--gold)',
                cursor: 'pointer'
              }}
            >GO HOME</button>
          </div>
        )}

        {/* PLACEHOLDER for real content */}
        {audit && !loading && (() => {
          const cfg = gradeConfig[audit.fillGrade];
          return (
            <div>
              {/* HERO SECTION — Part 2 */}
              <div 
                className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-center gap-[3rem] mb-[3rem] p-[2rem_2.5rem] relative overflow-hidden w-full"
                style={{
                  background: '#161614',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 60px rgba(0,0,0,0.4)'
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.3), transparent)' }} />
                
                {/* Background ambient glow */}
                <div style={{
                  position: 'absolute',
                  top: '-60px',
                  left: '-60px',
                  width: '280px',
                  height: '280px',
                  background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`,
                  pointerEvents: 'none',
                  zIndex: 0
                }} />

                {/* LEFT COLUMN — Grade Display */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', position: 'relative', zIndex: 1, minWidth: '200px' }}>
                  <div style={{
                    fontFamily: 'var(--font-playfair)',
                    fontStyle: 'italic',
                    fontSize: 'clamp(7rem, 12vw, 10rem)',
                    lineHeight: 1,
                    color: cfg.color,
                    filter: `drop-shadow(0 0 60px ${cfg.glow}) drop-shadow(0 0 120px ${cfg.glow})`,
                    letterSpacing: '-0.02em',
                    transition: 'color 0.5s ease',
                    minHeight: '1.2em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {audit.fillGrade}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    letterSpacing: '0.22em',
                    color: '#888078',
                    marginTop: '0.5rem'
                  }}>
                    {Math.round(audit.avgFillScore)}  /  100
                  </div>
                  <div style={{
                    padding: '0.25rem 0.75rem',
                    border: `1px solid ${cfg.color}20`,
                    borderRadius: '2px',
                    background: `${cfg.color}08`,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.58rem',
                    letterSpacing: '0.18em',
                    color: cfg.color,
                    opacity: 0.85
                  }}>
                    {cfg.label.toUpperCase()}
                  </div>
                </div>

                {/* RIGHT COLUMN — Three hero stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-[1.5rem] w-full" style={{ position: 'relative', zIndex: 1 }}>
                  
                  {/* Stat 1 — Estimated Loss */}
                  <div className="col-span-1 md:col-span-1" style={{
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    padding: '1.25rem 1.5rem',
                    background: '#1c1c1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' }}>
                      EST. EXECUTION LOSS
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1, letterSpacing: '-0.02em',
                      color: audit.estimatedLossUSD > 100 ? '#f97316' : audit.estimatedLossUSD > 50 ? '#fcd34d' : '#4ade80'
                    }}>
                      {formatCurrency(audit.estimatedLossUSD)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#484844' }}>
                      this period
                    </div>
                  </div>

                  {/* Stat 2 — Total Trades */}
                  <div className="col-span-1 md:col-span-1" style={{
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    padding: '1.25rem 1.5rem',
                    background: '#1c1c1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' }}>
                      TRADES ANALYSED
                    </div>
                    <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--text-primary, #ede8e0)' }}>
                      {formatNumber(audit.totalTrades)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#484844' }}>
                      across all symbols
                    </div>
                  </div>

                  {/* Stat 3 — Total Volume */}
                  <div className="col-span-2 md:col-span-1" style={{
                    display: 'flex', flexDirection: 'column', gap: '0.5rem',
                    padding: '1.25rem 1.5rem',
                    background: '#1c1c1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '3px',
                    position: 'relative',
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' }}>
                      TOTAL VOLUME
                    </div>
                    <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--text-primary, #ede8e0)' }}>
                      {formatCurrency(audit.totalNotional)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#484844' }}>
                      notional traded
                    </div>
                  </div>

                </div>
              </div>

              {/* PERIOD STRIP */}
              <div 
                className="flex flex-col md:flex-row items-start md:items-center justify-between gap-[0.5rem] p-[0.75rem_1rem] rounded-[2px] mb-[2rem]"
                style={{
                  background: 'var(--bg-overlay, #1a1917)',
                  border: '1px solid rgba(255,255,255,0.03)',
                  marginTop: '-1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.12em', color: '#888078' }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
                    <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1"/>
                    <line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" strokeWidth="1"/>
                    <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  PERIOD  ·  {formatPeriod(audit.period.start, audit.period.end)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#888078' }}>
                  <span>EXCHANGE  ·  {audit.exchange.toUpperCase()}</span>
                  <span>MAKER RATIO  ·  {Math.round(audit.breakdown.makerRatio * 100)}%</span>
                </div>
              </div>

              {/* SCORE BARS — Part 3 */}
              <div style={{ marginBottom: '2.5rem', marginTop: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.28em', color: '#a09890' }}>
                    COMPONENT SCORES
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.18em', color: '#a09890' }}>
                    Weighted Composite
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-[1rem]">
                  {[
                    {
                      label: 'SLIPPAGE',
                      key: 'slippage',
                      score: Math.min(100, Math.max(0, Math.round(100 - (audit.breakdown.avgSlippageBps * 6)))),
                      weight: '35%',
                      value: `${audit.breakdown.avgSlippageBps.toFixed(1)} bps avg`,
                      description: 'Arrival price vs execution'
                    },
                    {
                      label: 'FEE EFFICIENCY',
                      key: 'fees',
                      score: Math.min(100, Math.max(0, Math.round(audit.breakdown.makerRatio * 100))),
                      weight: '25%',
                      value: `${Math.round(audit.breakdown.makerRatio * 100)}% maker`,
                      description: 'Maker vs taker order ratio'
                    },
                    {
                      label: 'TIMING',
                      key: 'timing',
                      score: Math.min(100, Math.max(0, audit.breakdown.worstHour >= 22 || audit.breakdown.worstHour <= 7 ? 65 : 85)),
                      weight: '25%',
                      value: `Peak: ${audit.breakdown.bestHour}:00 UTC`,
                      description: 'Liquidity window quality'
                    },
                    {
                      label: 'SPREAD',
                      key: 'exchange',
                      score: Math.min(100, Math.max(0, Math.round(100 - (audit.breakdown.avgFeeDragBps * 2)))),
                      weight: '15%',
                      value: `${audit.breakdown.avgFeeDragBps.toFixed(1)} bps drag`,
                      description: 'Exchange spread cost'
                    }
                  ].map((component) => (
                    <div key={component.key} style={{
                      display: 'flex', flexDirection: 'column', gap: '1rem',
                      padding: '1.5rem',
                      background: '#161614',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '3px',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s ease',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(to right, transparent, ${getScoreColor(component.score)}30, transparent)` }} />
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.18em', color: '#888078' }}>
                          {component.label}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.1em', color: '#888078', padding: '2px 6px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                          {component.weight}
                        </div>
                      </div>

                      <div>
                        <div className="text-[2rem] md:text-[2.5rem]" style={{ margin: '0.25rem 0', fontFamily: 'var(--font-inter)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: getScoreColor(component.score), transition: 'color 0.3s ease' }}>
                          {component.score}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.12em', color: getScoreColor(component.score), opacity: 0.7 }}>
                          {getScoreLabel(component.score).toUpperCase()}
                        </div>
                        
                        <div style={{ margin: '0.25rem 0', width: '100%', height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.75rem' }}>
                          <div style={{
                            height: '100%',
                            width: `${barsVisible ? component.score : 0}%`,
                            background: `linear-gradient(to right, ${getScoreColor(component.score)}80, ${getScoreColor(component.score)})`,
                            borderRadius: '2px',
                            transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)'
                          }} />
                        </div>
                      </div>

                      <div style={{ marginTop: 'auto' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.08em', color: '#b8b0a6' }}>
                          {component.value}
                        </div>
                        <div style={{ fontFamily: 'var(--font-inter)', fontSize: '0.72rem', color: '#888078', lineHeight: 1.4, marginTop: '0.2rem' }}>
                          {component.description}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-[1rem]" style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: '#161614', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '3px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#888078' }}>
                      BEST SYMBOL
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', fontWeight: 600, color: '#4ade80' }}>
                      {audit.breakdown.bestSymbol}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: '#161614', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '3px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#888078' }}>
                      WORST SYMBOL
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.1em', fontWeight: 600, color: '#f97316' }}>
                      {audit.breakdown.worstSymbol}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* TREND CHART — Part 4 */}
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.28em', color: '#a09890' }}>
                    SCORE TREND
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a78b71' }} />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: '#585450' }}>
                        FillScore over time
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: '#585450', padding: '2px 8px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                      6 MONTHS
                    </div>
                  </div>
                </div>

                {(() => {
                  const trendData = generateTrendData(Math.round(audit.avgFillScore));
                  const scoreDiff = trendData[trendData.length - 1].score - trendData[0].score;
                  const isPositive = scoreDiff >= 0;

                  return (
                    <>
                      <div style={{ padding: '1.75rem 1.5rem 1rem', background: '#161614', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.25), transparent)' }} />
                        
                        <div className="h-[180px] md:h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                              <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#888078', letterSpacing: '0.1em' }} axisLine={false} tickLine={false} dy={8} />
                              <YAxis domain={[0, 100]} tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#888078' }} axisLine={false} tickLine={false} tickCount={5} dx={-4} />
                              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(167,139,113,0.15)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                              <ReferenceLine y={75} stroke="rgba(167,139,113,0.12)" strokeDasharray="4 4" label={{ value: 'GOOD', position: 'right', fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'rgba(167,139,113,0.4)', letterSpacing: '0.1em' }} />
                              <Line type="monotone" dataKey="score" stroke="#a78b71" strokeWidth={1.5} dot={(props) => {
                                const { cx, cy, payload } = props;
                                if (payload.isCurrent) {
                                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#a78b71" stroke="#0f0f0f" strokeWidth={2} />;
                                }
                                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={2.5} fill="#0f0f0f" stroke="#a78b71" strokeWidth={1.5} />;
                              }} activeDot={{ r: 5, fill: '#a78b71', stroke: '#0f0f0f', strokeWidth: 2 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="flex-col gap-[0.5rem] md:flex-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.875rem', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: isPositive ? '#4ade80' : '#f97316' }}>{isPositive ? '↑' : '↓'}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em', color: isPositive ? '#4ade80' : '#f97316' }}>
                            {Math.abs(scoreDiff)} pts over 6 months
                          </span>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.08em', color: '#888078' }}>
                          simulated trend  ·  real data after 2nd audit
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-[1rem]" style={{ marginTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: '#161614', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '3px' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#888078' }}>
                            BEST HOUR
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.08em', color: '#4ade80' }}>
                            {audit.breakdown.bestHour}:00 UTC
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: '#161614', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '3px' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.15em', color: '#888078' }}>
                            WORST HOUR
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.08em', color: '#f97316' }}>
                            {audit.breakdown.worstHour}:00 UTC
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* RECOMMENDATIONS — Part 5 */}
              <div style={{ marginBottom: '3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.28em', color: '#a09890' }}>
                    RECOMMENDATIONS
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: '#585450', padding: '2px 8px', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                    {audit.recommendations.length} INSIGHTS
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  {audit.recommendations.map((rec, index) => {
                    const hasDollar = /\$[\d,]+/.test(rec);
                    const sentences = rec.split('. ');
                    const headline = sentences.length > 1 ? sentences[0] + '.' : sentences[0];
                    const detail = sentences.slice(1).join('. ');
                    const clampedIndex = String(index + 1).padStart(2, '0');

                    return (
                      <div key={index}
                        onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(167,139,113,0.2)'}
                        onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
                        style={{
                          display: 'flex',
                          gap: '1.25rem',
                          alignItems: 'flex-start',
                          padding: '1.25rem 1.5rem',
                          background: '#161614',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: '3px',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'border-color 0.2s ease',
                          cursor: 'default'
                        }}
                      >
                        {/* Left accent bar */}
                        <div style={{
                          position: 'absolute',
                          left: 0, top: 0, bottom: 0,
                          width: '2px',
                          background: 'linear-gradient(to bottom, transparent, rgba(167,139,113,0.5), transparent)'
                        }} />

                        {/* Left column — number + icon */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexShrink: 0,
                          paddingTop: '2px'
                        }}>
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.55rem',
                            letterSpacing: '0.1em',
                            color: '#888078'
                          }}>{clampedIndex}</div>
                          <div style={{
                            fontSize: '1rem',
                            color: 'rgba(167,139,113,0.5)',
                            lineHeight: 1
                          }}>{getIcon(rec)}</div>
                        </div>

                        {/* Right column — content */}
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem'
                        }}>
                          <div style={{
                            fontFamily: 'var(--font-inter)',
                            fontSize: '0.88rem',
                            fontWeight: 500,
                            color: '#e8e4dc',
                            lineHeight: 1.4
                          }}>
                            {highlightDollars(headline)}
                          </div>

                          {detail && (
                            <div style={{
                              fontFamily: 'var(--font-inter)',
                              fontSize: '0.78rem',
                              color: '#888078',
                              lineHeight: 1.6,
                              marginTop: '0.1rem'
                            }}>
                              {highlightDollars(detail)}
                            </div>
                          )}

                          {hasDollar && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              marginTop: '0.5rem',
                              padding: '3px 8px',
                              background: 'rgba(74,222,128,0.06)',
                              border: '1px solid rgba(74,222,128,0.15)',
                              borderRadius: '2px',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.58rem',
                              letterSpacing: '0.1em',
                              color: '#4ade80',
                              opacity: 0.8,
                              width: 'fit-content'
                            }}>
                              POTENTIAL SAVINGS
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* BOTTOM CTA */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem 1.5rem',
                  background: 'rgba(167,139,113,0.04)',
                  border: '1px solid rgba(167,139,113,0.15)',
                  borderRadius: '3px',
                  marginTop: '1.5rem'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{
                      fontFamily: 'var(--font-playfair)',
                      fontStyle: 'italic',
                      fontSize: '1rem',
                      color: '#ede8e0'
                    }}>
                      See every trade in detail
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6rem',
                      letterSpacing: '0.1em',
                      color: '#888078'
                    }}>
                      Sortable table · Per-trade scores · Full breakdown
                    </div>
                  </div>
                  
                  <button
                    onClick={() => window.location.href = `/trades?userId=${userId}`}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'rgba(167,139,113,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(167,139,113,0.6)';
                      e.currentTarget.style.color = '#c4a882';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'rgba(167,139,113,0.35)';
                      e.currentTarget.style.color = '#a78b71';
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 1.25rem',
                      background: 'transparent',
                      border: '1px solid rgba(167,139,113,0.35)',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      letterSpacing: '0.12em',
                      color: '#a78b71',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    VIEW ALL TRADES
                  </button>
                </div>
              </div>

              {/* DASHBOARD FOOTER STRIP */}
              <div style={{
                paddingTop: '1.5rem',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                justifyContent: 'center',
                marginTop: '2rem'
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.58rem',
                  letterSpacing: '0.12em',
                  color: '#888078',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem'
                }}>
                  <span>FillScore v0.9 beta</span>
                  <span>·</span>
                  <span>Data: Jan 1 – Jan 31, 2024</span>
                  <span>·</span>
                  <span>AES-256-GCM encrypted</span>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
