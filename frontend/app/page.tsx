'use client'

import React, { useRef, useState, useEffect } from 'react';
import WaveBackground from '../components/ui/wave-background';
import Navbar from './components/Navbar';

export default function Home() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedExchange, setSelectedExchange] = useState<'binance' | 'bybit' | 'okx' | null>(null);
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = !confirmed || !apiKey.trim() || !apiSecret.trim() || !selectedExchange;

  const handleSubmit = async () => {
    if (isDisabled || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/connect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            apiSecret: apiSecret.trim(),
            exchange: selectedExchange
          })
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Connection failed')
      localStorage.setItem('userId', data.userId)
      window.location.href = `/dashboard?userId=${data.userId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSelect = (profileId: string, exchange: string) => {
    setSelectedDemo(profileId)
    localStorage.setItem('userId', profileId)
    window.location.href = `/dashboard?userId=${profileId}&exchange=${exchange}`
  }

  const demoProfiles = [
    {
      id: 'demo-disciplined',
      exchange: 'binance',
      exchangeLabel: 'BINANCE',
      exchangeColor: '#F0B90B',
      archetype: 'The Disciplined Trader',
      grade: 'A',
      avgScore: 84,
      makerRatio: '82%',
      tagline: 'Limit orders. Trades 8–16 UTC. Minimal slippage.'
    },
    {
      id: 'demo-moderate',
      exchange: 'binance',
      exchangeLabel: 'BINANCE',
      exchangeColor: '#F0B90B',
      archetype: 'The Moderate Trader',
      grade: 'B',
      avgScore: 67,
      makerRatio: '50%',
      tagline: 'Mixed strategy. Average execution quality.'
    },
    {
      id: 'demo-aggressive',
      exchange: 'binance',
      exchangeLabel: 'BINANCE',
      exchangeColor: '#F0B90B',
      archetype: 'The Aggressive Trader',
      grade: 'D',
      avgScore: 41,
      makerRatio: '25%',
      tagline: 'Market orders. Night trading. High fee drag.'
    },
    {
      id: 'demo-bybit',
      exchange: 'bybit',
      exchangeLabel: 'BYBIT',
      exchangeColor: '#F7A600',
      archetype: 'The Bybit Trader',
      grade: 'B',
      avgScore: 72,
      makerRatio: '50%',
      tagline: 'Derivatives platform. Institutional-grade fills.'
    },
    {
      id: 'demo-okx',
      exchange: 'okx',
      exchangeLabel: 'OKX',
      exchangeColor: '#1E8FFF',
      archetype: 'The OKX Trader',
      grade: 'B',
      avgScore: 72,
      makerRatio: '50%',
      tagline: 'Unified account. Spot + derivatives. Low fees.'
    },
    {
      id: 'demo-multi',
      exchange: 'multi',
      exchangeLabel: 'MULTI',
      exchangeColor: '#2dd4bf',
      archetype: 'The Multi-Exchange Trader',
      grade: '3 EXCHANGES',
      avgScore: 68,
      makerRatio: '50%',
      tagline: 'Trades across Binance, Bybit, and OKX. Compare venue alpha and execution quality.'
    }
  ]

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setCardVisible(true); },
      { threshold: 0.15 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    
    setUserId(localStorage.getItem('userId') || '');
    
    return () => observer.disconnect();
  }, []);

  const performScroll = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const exchanges = [
    {
      id: 'binance' as const,
      name: 'Binance',
      desc: "World's largest crypto exchange",
      tags: ['Spot', 'Futures', '#1 Volume']
    },
    {
      id: 'bybit' as const,
      name: 'Bybit',
      desc: "Institutional-grade derivatives platform",
      tags: ['Derivatives', 'Perpetuals', 'Institutional']
    },
    {
      id: 'okx' as const,
      name: 'OKX',
      desc: 'Unified account. Spot + derivatives. Low fees.',
      tags: ['Spot', 'Derivatives', 'Low Fees']
    }
  ];

  return (
    <>
      <div style={{ position: 'relative', minHeight: '100vh', background: '#0f0f0f', overflow: 'hidden', paddingBottom: '5rem', paddingTop: '48px' }}>
      
      {/* Layer 1 — Wave canvas */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <WaveBackground strokeColor="#7a6550" backgroundColor="transparent" />
      </div>

      {/* Layer 2 — Atmospheric vignette */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'linear-gradient(to bottom, rgba(15,15,15,0.82) 0%, rgba(15,15,15,0.38) 35%, rgba(15,15,15,0.55) 65%, rgba(15,15,15,0.96) 100%)' 
        }} />
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(10,10,10,0.6) 100%)' 
        }} />
      </div>

      {/* Layer 3 — Content */}
      <div style={{ position: 'relative', zIndex: 20 }}>
        
        {/* HEADER */}
        <Navbar userId={userId} currentPage="home" showLive={true} />

        {/* HERO */}
        <main className="px-5 pb-[5vh] sm:px-[2rem] text-left sm:text-center flex flex-col items-start sm:items-center justify-center relative pt-[8rem] sm:pt-[10vh]" 
              style={{ minHeight: '92vh' }}>
          
          {/* Decorative Elements */}
          <div className="hidden sm:block" style={{ position: 'absolute', top: '6vh', left: '3rem', width: '40px', height: '40px', borderTop: '1px solid rgba(167,139,113,0.15)', borderLeft: '1px solid rgba(167,139,113,0.15)' }} />
          <div className="hidden sm:block" style={{ position: 'absolute', top: '6vh', right: '3rem', width: '40px', height: '40px', borderTop: '1px solid rgba(167,139,113,0.15)', borderRight: '1px solid rgba(167,139,113,0.15)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontFamily: 'var(--font-mono)', fontSize: 'clamp(12rem, 20vw, 18rem)', color: 'rgba(167,139,113,0.018)', letterSpacing: '-0.05em', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', zIndex: -1 }}>
            TCA
          </div>

          {/* 1. Eyebrow label */}
          <div className="anim-fadein" style={{ animationDelay: '0.1s', display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '0.35rem 1rem 0.35rem 0.75rem', border: '1px solid rgba(167,139,113,0.35)', borderRadius: '2px', background: 'rgba(167,139,113,0.08)', marginBottom: '2.5rem', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', background: 'linear-gradient(to bottom, transparent, #a78b71, transparent)', borderRadius: '2px 0 0 2px' }} />
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#a78b71', opacity: 0.9 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.35em', color: '#b8a088' }}>
              INSTITUTIONAL-GRADE TCA
            </span>
          </div>

          {/* 2. Headline */}
          <div className="anim-fadein w-full text-left sm:text-center flex flex-col items-start sm:items-center" style={{ animationDelay: '0.22s', marginBottom: '1.75rem' }}>
            <div className="mr-auto ml-0 sm:mx-auto mb-6" style={{ width: '1px', height: '32px', background: 'linear-gradient(to bottom, transparent, rgba(167,139,113,0.3))' }} />
            <h1 style={{ 
              fontFamily: 'var(--font-playfair)', 
              fontStyle: 'italic',
              fontSize: 'clamp(3rem, 5.5vw, 4.5rem)', 
              lineHeight: 1.08,
              maxWidth: '780px', 
              color: '#ede8e0', 
              fontWeight: 400, 
              letterSpacing: '-0.015em'
            }}>
              Understand exactly<br />
              what your trades{' '}
              <span style={{
                fontStyle: 'italic',
                background: 'linear-gradient(135deg, #d4a574 0%, #f0dfc0 40%, #c4956a 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                cost you.
              </span>
            </h1>
          </div>

          {/* 3. Subtext */}
          <p className="anim-fadein"
             style={{ 
               animationDelay: '0.36s', 
               marginBottom: '3rem',
               maxWidth: '500px', 
               fontFamily: 'var(--font-inter)', 
               fontSize: '0.98rem', 
               lineHeight: 1.85, 
               color: '#a09890'
             }}>
            Institutional transaction cost analysis for retail crypto traders. Discover how much slippage, poor timing, and fees are costing you — trade by trade.
          </p>

          {/* 4. Stat strip */}
          <div className="anim-fadein w-full sm:w-auto mt-0" style={{ animationDelay: '0.48s' }}>
            <div className="flex flex-col sm:flex-row items-stretch border border-[rgba(167,139,113,0.22)] rounded-[3px] bg-[rgba(20,19,17,0.9)] backdrop-blur-[12px] overflow-hidden hover:border-[rgba(167,139,113,0.3)] transition-colors duration-300 w-full sm:w-auto">
              {[
                { label: 'avg slippage', value: '15–25 bps' },
                { label: 'fee drag', value: 'up to 10 bps' },
                { label: 'night spread', value: '2–4× wider' }
              ].map((stat, i, arr) => (
                <React.Fragment key={stat.label}>
                  <div className="flex items-center gap-[8px] py-[0.6rem] px-[1.25rem] w-full sm:w-auto" style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em'
                  }}>
                    <span style={{ color: '#888078' }}>{stat.label}</span>
                    <span style={{ color: '#888078', margin: '0 4px' }}>·</span>
                    <span style={{ color: '#b8a488', fontWeight: 600 }}>{stat.value}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <>
                      <div className="hidden sm:block w-[1px] h-auto bg-[rgba(167,139,113,0.15)] shrink-0" />
                      <div className="block sm:hidden w-full h-[1px] bg-[rgba(167,139,113,0.15)] shrink-0" />
                    </>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 5. Scroll hint */}
          <button 
            className="anim-fadein flex flex-col items-center gap-[8px] hover:opacity-100 transition-opacity duration-200 cursor-pointer bg-transparent border-none outline-none mt-[2.5rem]"
            onClick={performScroll}
            style={{ animationDelay: '0.62s', opacity: 0.6 }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.25em', color: '#8a7a68' }}>
              scroll
            </span>
            <div style={{ width: '1px', height: '28px', background: 'linear-gradient(to bottom, #a78b71, transparent)' }} />
          </button>

        </main>

        {/* CARD SECTION — Part 4 */}
        <div className="flex justify-center px-[1.25rem] sm:px-[1.5rem]" style={{ paddingBottom: '10rem' }}>
          <div ref={cardRef} className="w-full max-w-[520px] relative overflow-hidden rounded-[3px]"
               style={{
                 background: '#141412',
                 border: '1px solid rgba(167,139,113,0.2)',
                 padding: '0',
                 backdropFilter: 'blur(40px)',
                 WebkitBackdropFilter: 'blur(40px)',
                 boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 120px rgba(167,139,113,0.06), 0 60px 100px rgba(0,0,0,0.6)',
                 transition: 'opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
                 opacity: cardVisible ? 1 : 0,
                 transform: cardVisible ? 'translateY(0)' : 'translateY(32px)'
               }}>
            
            {/* Card ambient glow */}
            <div style={{
              position: 'absolute',
              bottom: '-80px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '300px',
              height: '150px',
              background: 'radial-gradient(ellipse, rgba(167,139,113,0.06) 0%, transparent 70%)',
              pointerEvents: 'none',
              zIndex: 0
            }} />

            {/* Card top accent bar */}
            <div style={{
              height: '1px',
              width: '100%',
              background: 'linear-gradient(to right, transparent 0%, rgba(167,139,113,0.3) 15%, rgba(232,213,183,0.85) 50%, rgba(167,139,113,0.3) 85%, transparent 100%)',
              position: 'relative',
              zIndex: 1
            }} />

            {/* Card content wrapper */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              
              {/* CARD HEADER ROW */}
              <div className="flex justify-between items-center border-b border-[rgba(255,255,255,0.04)] px-[1.25rem] py-[1.25rem] sm:px-[2rem] sm:pt-[1.5rem] sm:pb-[1.25rem]">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.3em', color: '#a78b71', opacity: 1 }}>
                  01  /  CONNECT
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.2em', color: '#8a7560' }}>
                    READY
                  </span>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#a78b71',
                    boxShadow: '0 0 10px rgba(167,139,113,0.8), 0 0 20px rgba(167,139,113,0.3)',
                    animation: 'pulse-dot 2s ease-in-out infinite'
                  }} />
                </div>
              </div>

              {/* CARD BODY */}
              <div className="px-[1.25rem] py-[1.25rem] sm:px-[2rem] sm:pt-[1.75rem] sm:pb-[2rem]">
                <h2 style={{
                  fontFamily: 'var(--font-playfair)',
                  fontStyle: 'italic',
                  fontSize: '1.4rem',
                  color: '#ede8e0',
                  fontWeight: 400,
                  marginBottom: '1.5rem'
                }}>
                  Select Your Exchange
                </h2>

                {/* EXCHANGE GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: '0.75rem', alignItems: 'stretch' }}>
                  {exchanges.map((ex) => {
                    const isSelected = selectedExchange === ex.id;
                    return (
                      <button 
                        key={ex.id}
                        onClick={() => setSelectedExchange(ex.id)}
                        className={`group flex flex-col relative overflow-hidden w-full text-left rounded-[2px] transition-all duration-[220ms] ease cursor-pointer outline-none border p-[1.25rem] ${
                          isSelected 
                            ? 'bg-[rgba(167,139,113,0.07)] border-[rgba(167,139,113,0.45)]' 
                            : 'bg-[#1a1917] border-[rgba(255,255,255,0.08)] hover:border-[rgba(167,139,113,0.25)] hover:bg-[rgba(167,139,113,0.03)]'
                        }`}
                        style={{
                          height: '100%',
                          minHeight: '140px',
                          boxShadow: isSelected ? 'inset 0 1px 0 rgba(167,139,113,0.15), 0 0 30px rgba(167,139,113,0.06)' : 'none'
                        }}
                      >
                        {/* Top edge glow */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                          background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.7), transparent)',
                          opacity: isSelected ? 1 : 0, transition: 'opacity 0.2s ease'
                        }} />
                        
                        {/* Exchange SVG Logo */}
                        {ex.id === 'binance' ? (
                          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" 
                            style={{ marginBottom: '0.75rem', opacity: isSelected ? 1 : 0.3, transition: 'opacity 0.2s ease' }}>
                            <path d="M16 4L19.5 7.5L13 14L9.5 10.5L16 4Z" fill="#F3BA2F"/>
                            <path d="M9.5 10.5L13 14L7.5 19.5L4 16L9.5 10.5Z" fill="#F3BA2F"/>
                            <path d="M22.5 10.5L26 14L20.5 19.5L17 16L22.5 10.5Z" fill="#F3BA2F"/>
                            <path d="M16 18L19.5 21.5L16 25L12.5 21.5L16 18Z" fill="#F3BA2F"/>
                            <path d="M13 14L16 11L19 14L16 17L13 14Z" fill="#F3BA2F"/>
                          </svg>
                        ) : ex.id === 'bybit' ? (
                          <svg width="22" height="22" viewBox="0 0 32 32" fill="none"
                            style={{ marginBottom: '0.75rem', opacity: isSelected ? 1 : 0.3, transition: 'opacity 0.2s ease' }}>
                            <rect x="4" y="10" width="10" height="3" rx="1.5" fill="#F7A600"/>
                            <rect x="4" y="15" width="14" height="3" rx="1.5" fill="#F7A600"/>
                            <rect x="4" y="20" width="10" height="3" rx="1.5" fill="#F7A600"/>
                            <rect x="18" y="10" width="10" height="6" rx="2" fill="#F7A600"/>
                          </svg>
                        ) : (
                          <div style={{ marginBottom: '0.75rem', opacity: isSelected ? 1 : 0.3, transition: 'opacity 0.2s ease', fontFamily: 'var(--font-inter)', fontSize: '18px', fontWeight: 700, color: '#1E8FFF', height: '22px', display: 'flex', alignItems: 'center' }}>
                            OKX
                          </div>
                        )}
                        
                        {/* Name Line */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: '0.5rem' }}>
                          <span className={`transition-colors duration-200 uppercase tracking-[0.18em] font-mono text-[0.75rem] ${
                            isSelected ? 'text-[#e8d5b7]' : 'text-[#9a9490] group-hover:text-[#c4b8a8]'
                          }`}>
                            {ex.name}
                          </span>
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '2px', transition: 'all 0.2s ease',
                            background: isSelected ? '#a78b71' : 'transparent',
                            border: isSelected ? 'none' : '1px solid #2a2a2a',
                            boxShadow: isSelected ? '0 0 10px rgba(167,139,113,0.6)' : 'none'
                          }} />
                        </div>

                        {/* Description */}
                        <div style={{ fontFamily: 'var(--font-inter)', fontSize: '0.76rem', color: isSelected ? '#8a8078' : '#6a6560', lineHeight: 1.4, flex: 1, transition: 'color 0.2s ease' }}>
                          {ex.desc}
                        </div>

                        {/* Data Tags */}
                        <div className="hidden sm:flex flex-nowrap overflow-hidden" style={{ gap: '0.4rem', marginTop: 'auto', paddingTop: '0.875rem' }}>
                          {ex.tags.map(tag => (
                            <span key={tag} style={{
                              fontFamily: 'var(--font-mono)', fontSize: '0.52rem', letterSpacing: '0.1em',
                              padding: '2px 5px', borderRadius: '1px', transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                              color: isSelected ? '#a08060' : '#4a4844',
                              border: isSelected ? '1px solid rgba(167,139,113,0.25)' : '1px solid rgba(255,255,255,0.07)',
                              background: isSelected ? 'rgba(167,139,113,0.06)' : 'rgba(255,255,255,0.02)'
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* API FORM — Part 5 */}
                <div
                  className={`mt-6 ${selectedExchange ? 'form-visible' : 'form-enter'}`}
                  style={{ display: selectedExchange ? 'block' : 'none' }}
                >
                  <div style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.18), transparent)', margin: '1.5rem 0' }} />

                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.3em', color: 'var(--gold, #a78b71)', opacity: 1, marginBottom: '1.25rem' }}>
                    02  /  AUTHENTICATE
                  </div>
                  
                  <div style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.2rem', color: 'var(--text-primary, #ede8e0)', marginBottom: '1.5rem', fontWeight: 400 }}>
                    Enter your API credentials
                  </div>

                  {/* API KEY INPUT */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
                      API KEY
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="Paste your API key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="api-input"
                        style={{
                          width: '100%', padding: '0.85rem 2.8rem 0.85rem 0.9rem',
                          background: 'var(--bg-base, #0f0f0f)', border: '1px solid var(--bg-muted, #2a2926)',
                          borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                          color: '#c8b898', outline: 'none', transition: 'border-color 0.18s ease, box-shadow 0.18s ease'
                        }}
                      />
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                              className="eye-toggle"
                              style={{
                                position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-ghost, #3d3b38)',
                                padding: '2px', transition: 'color 0.15s ease'
                              }}>
                        {showApiKey ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* API SECRET INPUT */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary, #6a6560)' }}>
                      API SECRET
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showApiSecret ? 'text' : 'password'}
                        placeholder="Paste your API secret"
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        className="api-input"
                        style={{
                          width: '100%', padding: '0.85rem 2.8rem 0.85rem 0.9rem',
                          background: 'var(--bg-base, #0f0f0f)', border: '1px solid var(--bg-muted, #2a2926)',
                          borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                          color: '#c8b898', outline: 'none', transition: 'border-color 0.18s ease, box-shadow 0.18s ease'
                        }}
                      />
                      <button type="button" onClick={() => setShowApiSecret(!showApiSecret)}
                              className="eye-toggle"
                              style={{
                                position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-ghost, #3d3b38)',
                                padding: '2px', transition: 'color 0.15s ease'
                              }}>
                        {showApiSecret ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5"/>
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* WARNING BOX */}
                  <div className="warning-box" style={{
                    display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
                    padding: '0.875rem 1rem', background: 'rgba(167,139,113,0.05)',
                    borderLeft: '2px solid rgba(167,139,113,0.6)', borderRadius: '0 2px 2px 0',
                    margin: '1.25rem 0'
                  }}>
                    <span style={{ color: 'var(--gold, #a78b71)', fontSize: '0.82rem', marginTop: '1px', flexShrink: 0 }}>
                      ⚠
                    </span>
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', lineHeight: 1.6, color: '#8a7d6a' }}>
                      Only connect READ-ONLY API keys. FillScore never places orders or accesses withdrawal functions.
                    </span>
                  </div>

                  {/* COLLAPSIBLE GUIDE */}
                  <button type="button" onClick={() => setGuideOpen(!guideOpen)}
                    className="guide-trigger"
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'none', border: 'none', borderTop: '1px solid var(--bg-subtle, #201f1d)',
                      borderBottom: '1px solid var(--bg-subtle, #201f1d)', padding: '0.75rem 0',
                      cursor: 'pointer', margin: '1rem 0', transition: 'border-color 0.15s ease'
                    }}>
                    <span className="guide-left" style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: 'var(--text-tertiary, #6a6560)', textTransform: 'capitalize', transition: 'color 0.15s ease' }}>
                      How to create a read-only key on {selectedExchange}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold, #a78b71)', fontSize: '1rem', lineHeight: 1 }}>
                      {guideOpen ? '−' : '+'}
                    </span>
                  </button>
                  <div style={{
                    overflow: 'hidden', maxHeight: guideOpen ? '400px' : '0px', transition: 'max-height 0.3s ease'
                  }}>
                    <div style={{ padding: '0.75rem 0 0.5rem' }}>
                      <ol style={{ paddingLeft: '1.1rem', fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: 'var(--text-tertiary, #6a6560)', lineHeight: 1.9, listStyleType: 'decimal' }}>
                        {selectedExchange === 'binance' ? (
                          <>
                            <li>Log in to binance.com → Profile → API Management</li>
                            <li>Click "Create API" → System generated</li>
                            <li>Name it "fillscore-readonly"</li>
                            <li>Complete email / 2FA verification</li>
                            <li>Enable "Read Info" ONLY — disable all trading and withdrawal permissions</li>
                            <li>Copy both your API Key and Secret Key</li>
                          </>
                        ) : (
                          <>
                            <li>Log in to bybit.com → Account → API Management</li>
                            <li>Click "Create New Key"</li>
                            <li>Select "API Transaction" → name it "fillscore"</li>
                            <li>Set permissions to "Read-Only"</li>
                            <li>Complete verification</li>
                            <li>Copy your API Key and Secret</li>
                          </>
                        )}
                      </ol>
                    </div>
                  </div>

                  {/* CHECKBOX ROW */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', margin: '1.25rem 0' }}>
                    <div style={{ position: 'relative', width: '18px', height: '18px', flexShrink: 0, marginTop: '2px' }}>
                      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                             style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 1, margin: 0 }} />
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: '2px', transition: 'all 0.15s ease',
                        border: confirmed ? '1px solid var(--gold, #a78b71)' : '1px solid var(--bg-muted, #2a2926)',
                        background: confirmed ? 'var(--gold, #a78b71)' : 'transparent'
                      }}>
                        {confirmed && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none"
                            style={{ position: 'absolute', inset: 0, margin: 'auto', display: 'block' }}>
                            <polyline points="1.5 4 4.5 7 8.5 1"
                              stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </div>
                    <label onClick={() => setConfirmed(!confirmed)} style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: 'var(--text-tertiary, #6a6560)', lineHeight: 1.55, cursor: 'pointer' }}>
                      I confirm this API key has read-only permissions with no trading or withdrawal access
                    </label>
                  </div>

                  {/* ERROR MESSAGE */}
                  {error && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.875rem', padding: '0.75rem 0.9rem', background: 'rgba(192,57,43,0.07)', borderLeft: '2px solid rgba(192,57,43,0.65)', borderRadius: '0 2px 2px 0', fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: '#d9534f', lineHeight: 1.55 }}>
                      {error}
                    </div>
                  )}

                  {/* SUBMIT BUTTON */}
                  <button type="button" onClick={handleSubmit} disabled={isDisabled || loading}
                          className={`submit-btn ${isDisabled ? 'disabled' : 'enabled'}`}
                          style={{
                            width: '100%', marginTop: '1.25rem', padding: '0.925rem', borderRadius: '2px',
                            fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
                            transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                            cursor: (isDisabled || loading) ? 'not-allowed' : 'pointer'
                          }}>
                    {loading ? (
                      <>
                        <div style={{
                          width: 15, height: 15, border: '1.5px solid rgba(15,15,15,0.2)', borderTopColor: '#0f0f0f',
                          borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0
                        }}/>
                        Connecting securely...
                      </>
                    ) : (
                      'Analyse My Trades →'
                    )}
                  </button>
                  
                  {/* CARD FOOTER SECTION */}
                  <div className="my-[1.25rem] sm:mt-[1.75rem] sm:mb-[1.5rem]" style={{ height: '1px', background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.12), transparent)' }} />

                  {/* OR DIVIDER */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.2em', color: 'var(--text-ghost, #3d3b38)', whiteSpace: 'nowrap' }}>OR</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                  </div>

                  {/* DEMO PROFILE SELECTOR */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em',
                      color: '#4a4844', textAlign: 'center', marginBottom: '0.875rem'
                    }}>
                      Or explore with synthetic demo data
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginTop: '16px'
                    }}>
                      {demoProfiles.map((profile) => {
                        const isSelected = selectedDemo === profile.id
                        const gradeClr = (
                          profile.grade === '3 EXCHANGES' ? '#2dd4bf' :
                          profile.grade === 'A' ? '#4ade80' :
                          profile.grade === 'B' ? '#86efac' :
                          profile.grade === 'C' ? '#fcd34d' :
                          profile.grade === 'D' ? '#f97316' : '#ef4444'
                        )
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => handleDemoSelect(profile.id, profile.exchange)}
                            style={{
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              padding: '14px',
                              background: isSelected ? `${profile.exchangeColor}10` : 'rgba(20,19,18,0.8)',
                              border: `1px solid ${isSelected ? profile.exchangeColor : 'rgba(255,255,255,0.06)'}`,
                              borderRadius: '4px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              outline: 'none',
                              transition: 'all 0.15s ease',
                              minHeight: '140px',
                              boxShadow: isSelected
                                ? `0 0 18px ${profile.exchangeColor}18, inset 0 1px 0 ${profile.exchangeColor}20`
                                : 'none',
                              transform: isSelected ? 'translateY(-2px)' : 'translateY(0)'
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = `${profile.exchangeColor}40`
                                e.currentTarget.style.transform = 'translateY(-4px)'
                                e.currentTarget.style.boxShadow = `0 8px 24px ${profile.exchangeColor}12`
                                e.currentTarget.style.background = `${profile.exchangeColor}05`
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) {
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = 'none'
                                e.currentTarget.style.background = 'rgba(20,19,18,0.8)'
                              }
                            }}
                          >
                            {/* Top inset accent line on selected */}
                            <div style={{
                              position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                              background: `linear-gradient(to right, transparent, ${profile.exchangeColor}90, transparent)`,
                              borderRadius: '4px 4px 0 0',
                              opacity: isSelected ? 1 : 0,
                              transition: 'opacity 0.15s ease'
                            }} />

                            {/* Row 1: Exchange badge + Grade badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
                                color: profile.exchangeColor, padding: '2px 6px',
                                border: `1px solid ${profile.exchangeColor}60`,
                                borderRadius: '3px'
                              }}>
                                {profile.exchangeLabel}
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                                color: gradeClr, padding: '2px 8px',
                                border: `1px solid ${gradeClr}40`,
                                borderRadius: '3px'
                              }}>
                                {profile.grade}
                              </div>
                            </div>

                            {/* Row 2: Archetype name */}
                            <div style={{
                              fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 600,
                              color: isSelected ? '#ede8e0' : '#c8c0b8',
                              transition: 'color 0.15s ease'
                            }}>
                              {profile.archetype}
                            </div>

                            {/* Row 3: Tagline */}
                            <div style={{
                              fontFamily: 'var(--font-inter)', fontSize: '11px',
                              color: '#585450', whiteSpace: 'normal'
                            }}>
                              {profile.tagline}
                            </div>

                            {/* Row 4: Stats row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: '10px',
                                color: 'rgba(255,255,255,0.6)', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '3px'
                              }}>
                                {profile.avgScore} avg
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: '10px',
                                color: 'rgba(255,255,255,0.6)', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '3px'
                              }}>
                                {profile.makerRatio} maker
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  
                  {/* CARD BOTTOM ACCENT */}
                  <div style={{ marginTop: '1.5rem', height: '1px', background: 'linear-gradient(to right, transparent, rgba(167,139,113,0.08), transparent)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* BOTTOM STRIP */}
      <div className="px-[1rem] py-[0.625rem] sm:px-[2rem] sm:py-[0.75rem]" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.04)'
      }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0 }}>
          
          <div className="trust-badge px-[0.875rem] text-[0.55rem] sm:px-[2rem] sm:text-[0.6rem]" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--text-ghost, #3d3b38)', transition: 'color 0.2s ease' }}>
            <span style={{ fontSize: '0.7rem' }}>🔒</span>
            <span>Read-only keys only</span>
          </div>

          <div className="hidden sm:block" style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          
          <div className="trust-badge px-[0.875rem] text-[0.55rem] sm:px-[2rem] sm:text-[0.6rem]" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--text-ghost, #3d3b38)', transition: 'color 0.2s ease' }}>
            <span style={{ fontSize: '0.7rem' }}>⚡</span>
            <span>AES-256-GCM encrypted</span>
          </div>

          <div className="hidden sm:block" style={{ width: '1px', height: '10px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          
          <div className="trust-badge px-[0.875rem] text-[0.55rem] sm:px-[2rem] sm:text-[0.6rem]" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: 'var(--text-ghost, #3d3b38)', transition: 'color 0.2s ease' }}>
            <span style={{ fontSize: '0.7rem' }}>◎</span>
            <span>No trading access</span>
          </div>
          
        </div>
      </div>
    </>
  );
}
