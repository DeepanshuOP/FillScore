'use client'

import React from 'react';
import WaveBackground from '../../components/ui/wave-background';

export default function TestWavesPage() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#0a0a0a' }}>
      <WaveBackground strokeColor="#a78b71" />
      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          pointerEvents: 'none' 
        }}
      >
        <span style={{ 
          fontFamily: 'var(--font-mono)', 
          color: 'rgba(167,139,113,0.6)', 
          fontSize: '0.8rem', 
          letterSpacing: '0.3em' 
        }}>
          Wave Test — Move your mouse
        </span>
      </div>
    </div>
  );
}
