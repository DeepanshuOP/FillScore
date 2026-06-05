import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function Image({ params }: Props) {
  const { userId } = await params;
  
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/share/${userId}`, { next: { revalidate: 3600 } });
    
    if (!res.ok) {
      // Return default generic card if no data
      return new ImageResponse(
        (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#0d0d0b', color: '#ede8e0', fontFamily: 'monospace'
          }}>
            <div style={{ fontSize: 64, color: '#c9b99a', letterSpacing: '0.2em' }}>FILLSCORE</div>
            <div style={{ fontSize: 32, marginTop: 40, color: '#888078' }}>How well do you actually execute?</div>
            <div style={{ fontSize: 24, marginTop: 20, color: '#4ade80' }}>fillscore.io</div>
          </div>
        ),
        { ...size }
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
      if (e === 'okx') return '#2dd4bf'; // Cyan
      return '#ede8e0';
    };

    const gradeColor = data.grade === 'A' ? '#4ade80' : data.grade === 'B' ? '#86efac' : data.grade === 'C' ? '#fcd34d' : data.grade === 'D' ? '#f97316' : '#ef4444';

    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          backgroundColor: '#0d0d0b', color: '#ede8e0', padding: '60px',
          position: 'relative', fontFamily: 'sans-serif'
        }}>
          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ fontSize: 36, color: '#c9b99a', letterSpacing: '0.2em', fontWeight: 'bold' }}>FILLSCORE</div>
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '8px 16px', border: `2px solid ${getExchangeColor(data.exchange)}40`,
              borderRadius: '4px', fontSize: 24, color: getExchangeColor(data.exchange),
              letterSpacing: '0.1em', backgroundColor: `${getExchangeColor(data.exchange)}10`
            }}>
              {data.exchange}
            </div>
          </div>

          {/* Main Content Area */}
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {/* Left: Grade */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40%' }}>
              <div style={{ display: 'flex', fontSize: 280, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{data.grade}</div>
            </div>
            
            {/* Right: Score and details */}
            <div style={{ display: 'flex', flexDirection: 'column', width: '60%', paddingLeft: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', fontSize: 100, fontWeight: 800, color: '#ede8e0' }}>{data.score}</div>
                <div style={{ display: 'flex', fontSize: 48, color: '#888078', marginLeft: '16px' }}>/ 100</div>
              </div>
              <div style={{ display: 'flex', fontSize: 36, color: getScoreColor(data.score), letterSpacing: '0.15em', marginTop: '10px' }}>
                {getScoreLabel(data.score)}
              </div>
              <div style={{ display: 'flex', fontSize: 24, color: '#888078', marginTop: '20px', letterSpacing: '0.1em' }}>
                {data.period}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '30px', marginTop: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 16, color: '#888078', letterSpacing: '0.1em' }}>TRADES</div>
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: '#ede8e0', marginTop: '8px' }}>{data.topStats.tradesAnalysed}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 16, color: '#888078', letterSpacing: '0.1em' }}>MAKER RATIO</div>
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: '#ede8e0', marginTop: '8px' }}>{data.topStats.makerRatio}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 16, color: '#888078', letterSpacing: '0.1em' }}>AVG SLIPPAGE</div>
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: '#ede8e0', marginTop: '8px' }}>{data.topStats.avgSlippageBps} bps</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 16, color: '#888078', letterSpacing: '0.1em' }}>BEST SYMBOL</div>
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: '#4ade80', marginTop: '8px' }}>{data.topStats.bestSymbol}</div>
            </div>
          </div>

          {/* Footer Tagline */}
          <div style={{ position: 'absolute', bottom: '30px', left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', fontSize: 24, color: '#a78b71', fontStyle: 'italic' }}>
              How well do you actually execute? <span style={{ margin: '0 10px', color: '#888078' }}>·</span> fillscore.io
            </div>
          </div>
        </div>
      ),
      { ...size }
    );
  } catch (err) {
    // Fallback on error
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#0d0d0b', color: '#ede8e0'
        }}>
          <div style={{ display: 'flex', fontSize: 64, color: '#c9b99a', letterSpacing: '0.2em' }}>FILLSCORE</div>
          <div style={{ display: 'flex', fontSize: 24, marginTop: 20, color: '#4ade80' }}>fillscore.io</div>
        </div>
      ),
      { ...size }
    );
  }
}
