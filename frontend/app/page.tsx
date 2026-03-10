'use client'

import React, { useRef } from 'react';
import WaveBackground from '../components/ui/wave-background';

export default function Home() {
  const cardRef = useRef<HTMLDivElement>(null);

  const performScroll = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0a0a0a', overflow: 'hidden' }}>
      
      {/* Layer 1 — Wave canvas */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <WaveBackground strokeColor="#a78b71" backgroundColor="transparent" />
      </div>

      {/* Layer 2 — Atmospheric vignette */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'linear-gradient(to bottom, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.50) 35%, rgba(10,10,10,0.70) 65%, rgba(10,10,10,0.98) 100%)' 
        }} />
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'radial-gradient(ellipse 120% 80% at 50% 0%, transparent 40%, rgba(10,10,10,0.6) 100%)' 
        }} />
      </div>

      {/* Layer 3 — Content */}
      <div style={{ position: 'relative', zIndex: 20 }}>
        
        <header style={{
          padding: '1.75rem 3rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.055)'
        }} className="px-5 py-5 sm:px-12 sm:py-7">
          
          {/* Left side — Logo lockup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.05rem',
              letterSpacing: '0.34em',
              background: 'linear-gradient(135deg, #a78b71 0%, #e8d5b7 45%, #c4a882 70%, #a78b71 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              FILLSCORE
            </span>
            <div style={{
              width: '90px',
              height: '1px',
              background: 'linear-gradient(to right, rgba(167,139,113,0.8) 0%, rgba(167,139,113,0.3) 50%, transparent 100%)',
              marginTop: '2px'
            }} />
          </div>

          {/* Right side */}
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            
            {/* Item 1 — Live status indicator */}
            <div className="hidden sm:flex" style={{ alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '5px', 
                height: '5px', 
                borderRadius: '50%', 
                background: '#4db87a',
                boxShadow: '0 0 8px rgba(77,184,122,0.9)',
                animation: 'pulse-status 2.5s ease-in-out infinite'
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.6rem', 
                letterSpacing: '0.22em',
                color: '#4db87a', 
                opacity: 1
              }}>
                SYSTEM ONLINE
              </span>
            </div>

            {/* Item 2 — Tagline */}
            <span style={{
              fontFamily: 'var(--font-playfair)', 
              fontStyle: 'italic', 
              fontSize: '0.85rem',
              color: '#5a5a52', 
              letterSpacing: '0.02em'
            }}>
              Execution Intelligence
            </span>

          </div>
        </header>

        {/* HERO */}
        <main className="px-5 pt-16 pb-12 sm:px-8 sm:pt-24 sm:pb-16 flex flex-col justify-center items-center text-center" 
              style={{ minHeight: '46vh' }}>
          
          {/* 1. Eyebrow label */}
          <div className="anim-fadein" style={{ animationDelay: '0.1s', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(to right, transparent, #a78b71)', opacity: 0.4 }} />
            
            <div style={{
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '7px',
              padding: '0.3rem 0.8rem', 
              border: '1px solid rgba(167,139,113,0.4)', 
              borderRadius: '1px',
              background: 'rgba(167,139,113,0.07)'
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#a78b71', opacity: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', letterSpacing: '0.38em', color: '#b09478', opacity: 1 }}>
                INSTITUTIONAL-GRADE TCA
              </span>
            </div>
            
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(to left, transparent, #a78b71)', opacity: 0.4 }} />
          </div>

          {/* 2. Headline */}
          <h1 className="anim-fadein" 
              style={{ 
                animationDelay: '0.22s', 
                marginBottom: '1.5rem',
                fontFamily: 'var(--font-playfair)', 
                fontStyle: 'italic',
                fontSize: 'clamp(2.6rem, 5vw, 4rem)', 
                lineHeight: 1.1,
                maxWidth: '700px', 
                color: '#ede9e3', 
                fontWeight: 400, 
                letterSpacing: '-0.01em'
              }}>
            Understand exactly<br />
            what your trades{' '}
            <span style={{
              fontStyle: 'italic',
              background: 'linear-gradient(135deg, #c4a882 0%, #e8d5b7 35%, #a78b71 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              cost you.
            </span>
          </h1>

          {/* 3. Subtext */}
          <p className="anim-fadein"
             style={{ 
               animationDelay: '0.36s', 
               marginBottom: '2.5rem',
               maxWidth: '480px', 
               fontFamily: 'var(--font-inter)', 
               fontSize: '0.92rem', 
               lineHeight: 1.85, 
               color: '#525250'
             }}>
            Institutional transaction cost analysis for retail crypto traders. Discover how much slippage, poor timing, and fees are costing you — trade by trade.
          </p>

          {/* 4. Stat pills row */}
          <div className="anim-fadein flex flex-col sm:flex-row flex-wrap" 
               style={{ animationDelay: '0.48s', gap: '0.625rem', justifyContent: 'center', alignItems: 'center' }}>
            {[
              "avg slippage  ·  15–25 bps",
              "fee drag  ·  up to 10 bps",
              "night spread  ·  2–4× wider"
            ].map((text, i) => (
              <div key={i} className="group transition-all duration-200 hover:border-[rgba(167,139,113,0.45)] hover:text-[#9a8a78] hover:bg-[rgba(167,139,113,0.07)]"
                   style={{
                     display: 'inline-flex', 
                     alignItems: 'center', 
                     gap: '7px',
                     padding: '0.4rem 0.875rem',
                     border: '1px solid rgba(167,139,113,0.22)',
                     background: 'rgba(167,139,113,0.04)', 
                     backdropFilter: 'blur(8px)',
                     borderRadius: '2px', 
                     fontFamily: 'var(--font-mono)', 
                     fontSize: '0.65rem', 
                     color: '#6e6e68', 
                     letterSpacing: '0.06em'
                   }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#a78b71', opacity: 0.7 }} />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* 5. Scroll hint */}
          <button 
            className="anim-fadein hidden sm:flex hover:opacity-100 transition-opacity duration-300"
            onClick={performScroll}
            style={{ 
              animationDelay: '0.62s',
              marginTop: '3rem', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '6px', 
              opacity: 0.45,
              background: 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.25em', color: '#8a7a68' }}>
              scroll
            </span>
            <div style={{ width: '1px', height: '28px', background: 'linear-gradient(to bottom, #a78b71, transparent)' }} />
          </button>

        </main>

        {/* CARD SECTION — Part 4 */}
        <div ref={cardRef}></div>

      </div>
    </div>
  );
}
