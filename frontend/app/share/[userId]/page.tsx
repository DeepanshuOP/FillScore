import { Metadata } from 'next';
import Link from 'next/link';
import ShareButtons from './ShareButtons';

type Props = {
  params: Promise<{ userId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/share/${userId}`, { next: { revalidate: 3600 } });
  if (!res.ok) return { title: 'FillScore' };
  
  const data = await res.json();
  const title = `FillScore: Grade ${data.grade} (${data.score}/100)`;
  const description = `I scored ${data.score}/100 on execution quality across ${data.topStats.tradesAnalysed} trades. How well do you execute? — fillscore.io`;
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website'
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description
    }
  };
}

export default async function SharePage({ params }: Props) {
  const { userId } = await params;
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/share/${userId}`, { next: { revalidate: 60 } });
  
  if (!res.ok) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0f0f0f)', color: '#ede8e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-mono)' }}>This score card is no longer available.</p>
      </div>
    );
  }

  const data = await res.json();

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#fcd34d';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };
  
  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'AVERAGE';
    if (score >= 40) return 'POOR';
    return 'CRITICAL';
  };

  const getExchangeColor = (ex: string) => {
    const e = (ex || '').toLowerCase();
    if (e === 'binance') return '#F0B90B';
    if (e === 'bybit') return '#F7A600';
    if (e === 'okx') return '#2dd4bf'; // Cyan for MULTI or OKX
    return '#ede8e0';
  };

  const gradeColor = data.grade === 'A' ? '#4ade80' : data.grade === 'B' ? '#86efac' : data.grade === 'C' ? '#fcd34d' : data.grade === 'D' ? '#f97316' : '#ef4444';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base, #0f0f0f)',
      color: 'var(--text-primary, #ede8e0)',
      fontFamily: 'var(--font-inter)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        width: '100%', maxWidth: '600px',
        background: '#161614', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px', padding: '3rem 2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', position: 'relative', overflow: 'hidden'
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '300px', height: '300px', background: gradeColor,
          opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none'
        }} />

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', letterSpacing: '0.2em', color: '#c9b99a', marginBottom: '0.5rem' }}>
          FILLSCORE
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#888078', letterSpacing: '0.1em', marginBottom: '2rem' }}>
          {data.period}
        </div>

        <div style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '6rem', lineHeight: 1, color: gradeColor, textShadow: `0 0 40px ${gradeColor}40` }}>
          {data.grade}
        </div>
        <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.5rem', fontWeight: 600, color: '#ede8e0', marginTop: '1rem' }}>
          {data.score} <span style={{ color: '#888078', fontSize: '1rem' }}>/ 100</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', letterSpacing: '0.15em', color: getScoreColor(data.score), marginTop: '0.5rem' }}>
          {getScoreLabel(data.score)}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '1rem' }}>
          <div style={{
            padding: '4px 10px', border: `1px solid ${getExchangeColor(data.exchange)}40`,
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            color: getExchangeColor(data.exchange), letterSpacing: '0.1em', background: `${getExchangeColor(data.exchange)}10`
          }}>
            {data.exchange}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#888078', letterSpacing: '0.1em' }}>TRADES</div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.25rem', fontWeight: 600, color: '#ede8e0', marginTop: '0.25rem' }}>{data.topStats.tradesAnalysed}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#888078', letterSpacing: '0.1em' }}>MAKER RATIO</div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.25rem', fontWeight: 600, color: '#ede8e0', marginTop: '0.25rem' }}>{data.topStats.makerRatio}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#888078', letterSpacing: '0.1em' }}>AVG SLIPPAGE</div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.25rem', fontWeight: 600, color: '#ede8e0', marginTop: '0.25rem' }}>{data.topStats.avgSlippageBps} bps</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#888078', letterSpacing: '0.1em' }}>BEST SYMBOL</div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: '1.25rem', fontWeight: 600, color: '#4ade80', marginTop: '0.25rem' }}>{data.topStats.bestSymbol}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.1rem', color: '#a78b71', marginBottom: '1rem' }}>
          How well do you actually execute?
        </p>
        <Link href="/" style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          background: 'transparent',
          border: '1px solid rgba(167,139,113,0.3)',
          borderRadius: '2px',
          color: '#c4a882',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          letterSpacing: '0.15em',
          textDecoration: 'none',
          transition: 'all 0.2s ease'
        }}>
          GET YOUR FILLSCORE →
        </Link>
        <ShareButtons shareUrl={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://fillscore.io'}/share/${userId}`} grade={data.grade} score={data.score} />
      </div>
    </div>
  );
}
