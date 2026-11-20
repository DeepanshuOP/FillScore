import { serverApiBase } from '../../lib/serverApiBase';
import { ImageResponse } from 'next/og';
import { siteHost } from '../../lib/siteHost';
import { getGradeColor } from '../../utils/gradeColor';
import { fetchMeasured } from './measured';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Props = {
  params: Promise<{ userId: string }>;
};

// Design v3: a receipt with the grade stamped on it, laid on the paper. A raster, so the paper theme's hex values are
// used here and only here (tokens.css, [data-theme="paper"]). System sans-serif: the web fonts are not loaded here.
const PAPER = '#F3F2EE';
const RECEIPT = '#FBFBF8';
const INK = '#121210';
const GRAPHITE = '#6B6A66';
const RULE = '#D8D6CF';
const FONT = 'system-ui, sans-serif';
const MONO = 'ui-monospace, monospace';

function Generic({ note }: { note?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER, color: INK, fontFamily: FONT }}>
      <div style={{ display: 'flex', fontSize: 80, fontWeight: 900, letterSpacing: -3 }}>FillScore</div>
      <div style={{ display: 'flex', fontSize: 30, marginTop: 20, color: GRAPHITE }}>Every fill, held to the tape.</div>
      {note ? <div style={{ display: 'flex', fontSize: 24, marginTop: 20, color: GRAPHITE, fontFamily: MONO }}>{note}</div> : null}
    </div>
  );
}

export default async function Image({ params }: Props) {
  const { userId } = await params;

  try {
    const res = await fetch(`${serverApiBase()}/audit/share/${encodeURIComponent(userId)}`, { next: { revalidate: 3600 } });

    if (!res.ok) {
      return new ImageResponse(<Generic note={siteHost() || undefined} />, { ...size });
    }

    const data = await res.json();
    // The share endpoint returns the v1 grade; a measured (v2) grade leads when the response carries one.
    const v1 = { grade: String(data.grade), score: data.score };
    const measured = data.measured && typeof data.measured.grade === 'string' && typeof data.measured.score === 'number' ? data.measured as { grade: string; score: number } : await fetchMeasured(userId);
    const lead = measured ?? v1;
    const stamp = getGradeColor(lead.grade);
    const demo = userId.startsWith('demo-');

    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER, fontFamily: FONT }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 1000, height: 510, backgroundColor: RECEIPT, color: INK, padding: '44px 56px', boxShadow: '0 30px 50px -28px rgba(18,18,16,0.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
              <div style={{ display: 'flex', fontSize: 52, fontWeight: 900, letterSpacing: -2 }}>FillScore</div>
              <div style={{ display: 'flex', fontSize: 22, color: GRAPHITE, fontFamily: MONO }}>{String(data.period).toUpperCase()}</div>
            </div>
            <div style={{ display: 'flex', fontSize: 20, color: GRAPHITE, fontFamily: MONO, marginTop: 6 }}>
              {demo ? 'SCORE CARD. SYNTHETIC TRADER, REAL PRICES' : 'SCORE CARD. MEASURED AGAINST PUBLIC MARKET PRINTS'}
            </div>
            <div style={{ display: 'flex', borderTop: `2px dashed ${INK}`, marginTop: 22 }} />
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '58%' }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <div style={{ display: 'flex', fontSize: 140, fontWeight: 900, letterSpacing: -6, lineHeight: 1 }}>{lead.score}</div>
                  <div style={{ display: 'flex', fontSize: 36, color: GRAPHITE, marginLeft: 16 }}>out of 100</div>
                </div>
                <div style={{ display: 'flex', fontSize: 28, marginTop: 12 }}>{measured ? 'Measured score (v2)' : 'Rule-based score (v1)'}</div>
                {measured ? (
                  <div style={{ display: 'flex', fontSize: 22, color: GRAPHITE, marginTop: 12, fontFamily: MONO }}>RULE-BASED (V1): GRADE {v1.grade}, {v1.score} OUT OF 100</div>
                ) : null}
              </div>
              <div style={{ display: 'flex', width: '42%', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: stamp, border: `6px solid ${stamp}`, borderRadius: 24, padding: '10px 40px 16px', transform: 'rotate(-7deg)' }}>
                  <div style={{ display: 'flex', fontSize: 22, fontFamily: MONO, letterSpacing: 2 }}>GRADED</div>
                  <div style={{ display: 'flex', fontSize: 190, fontWeight: 900, lineHeight: 0.9 }}>{lead.grade}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: `2px solid ${RULE}`, paddingTop: 18, fontSize: 22, color: GRAPHITE, fontFamily: MONO }}>
              <div style={{ display: 'flex' }}>{data.topStats.tradesAnalysed} TRADES ANALYSED</div>
              <div style={{ display: 'flex' }}>{siteHost()}</div>
            </div>
          </div>
        </div>
      ),
      { ...size }
    );
  } catch {
    return new ImageResponse(<Generic note={siteHost() || undefined} />, { ...size });
  }
}
