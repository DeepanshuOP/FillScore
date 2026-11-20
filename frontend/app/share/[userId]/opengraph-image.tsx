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

// A raster on the dark ground, so hex values are used here and only here. Sans-serif system fallback (Geist is not loaded).
const GROUND = '#0B1015';
const INK = '#E8EDF2';
const MUTED = '#8A96A3';
const FONT = 'Geist, Inter, system-ui, sans-serif';

function Generic({ note }: { note?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: GROUND, color: INK, fontFamily: FONT }}>
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700 }}>FillScore</div>
      <div style={{ display: 'flex', fontSize: 32, marginTop: 24, color: MUTED }}>Measured against public market prints</div>
      {note ? <div style={{ display: 'flex', fontSize: 24, marginTop: 20, color: MUTED }}>{note}</div> : null}
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
    const colour = getGradeColor(lead.grade);

    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: GROUND, color: INK, padding: '60px', fontFamily: FONT }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 700 }}>FillScore</div>
            <div style={{ display: 'flex', fontSize: 24, color: MUTED }}>{data.period}</div>
          </div>

          <div style={{ display: 'flex', flex: 1, alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', width: '40%', justifyContent: 'center', fontSize: 300, fontWeight: 700, color: colour, lineHeight: 1 }}>{lead.grade}</div>
            <div style={{ display: 'flex', flexDirection: 'column', width: '60%', paddingLeft: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', fontSize: 110, fontWeight: 700 }}>{lead.score}</div>
                <div style={{ display: 'flex', fontSize: 44, color: MUTED, marginLeft: '16px' }}>out of 100</div>
              </div>
              <div style={{ display: 'flex', fontSize: 32, marginTop: '12px' }}>{measured ? 'Measured score (v2)' : 'Rule-based score (v1)'}</div>
              <div style={{ display: 'flex', fontSize: 28, color: MUTED, marginTop: '12px' }}>Measured against public market prints</div>
              {measured ? (
                <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginTop: '24px' }}>Rule-based score (v1): grade {v1.grade}, {v1.score} out of 100</div>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: '2px solid #243040', paddingTop: '24px', fontSize: 24, color: MUTED }}>
            <div style={{ display: 'flex' }}>{data.topStats.tradesAnalysed} trades analysed</div>
            <div style={{ display: 'flex' }}>{siteHost()}</div>
          </div>
        </div>
      ),
      { ...size }
    );
  } catch {
    return new ImageResponse(<Generic note={siteHost() || undefined} />, { ...size });
  }
}
