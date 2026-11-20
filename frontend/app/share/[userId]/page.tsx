import { serverApiBase } from '../../lib/serverApiBase';
import { siteHost } from '../../lib/siteHost';
import { Metadata } from 'next';
import Link from 'next/link';
import ShareButtons from './ShareButtons';
import { fetchMeasured } from './measured';
import { MarketingNav } from '../../components/marketing/MarketingNav';
import SiteFooter from '../../components/SiteFooter';
import { GradeChip } from '../../ui/GradeChip';
import { ProvenanceChip } from '../../ui/ProvenanceChip';
import { buttonClass } from '../../ui/buttonClass';

type Props = {
  params: Promise<{ userId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const res = await fetch(`${serverApiBase()}/audit/share/${encodeURIComponent(userId)}`, { next: { revalidate: 3600 } });   // encoded: a decoded "../" must not reach another route (security review M9)
  if (!res.ok) return { title: 'FillScore' };

  const data = await res.json();
  const title = `FillScore: Grade ${data.grade} (${data.score}/100)`;
  const description = `I scored ${data.score}/100 on execution quality across ${data.topStats.tradesAnalysed} trades. How well do you execute?${siteHost() ? ` — ${siteHost()}` : ''}`;

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

/** The share endpoint returns the v1 grade and score. A measured (v2) grade is shown first when the response carries one. */
type Grade = { grade: string; score: number };

export default async function SharePage({ params }: Props) {
  const { userId } = await params;
  const res = await fetch(`${serverApiBase()}/audit/share/${encodeURIComponent(userId)}`, { next: { revalidate: 60 } });

  if (!res.ok) {
    return (
      <>
        <MarketingNav />
        <main className="min-h-screen bg-ui-surface">
          <div className="mx-auto flex max-w-[1240px] flex-col items-center px-5 pt-40 text-center sm:px-8">
            <h1 className="display-md text-ui-ink">This score card is no longer available.</h1>
            <Link href="/" className={buttonClass('secondary', 'md', 'mt-8 no-underline')}>Go to the home page</Link>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const data = await res.json();
  const v1: Grade = { grade: data.grade, score: data.score };
  const measured: Grade | null = data.measured && typeof data.measured.grade === 'string' && typeof data.measured.score === 'number' ? data.measured : await fetchMeasured(userId);
  const lead = measured ?? v1;
  const source = userId.startsWith('demo-') ? 'synthetic-demo' : 'real-user';

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8">
          {/* design v3: the score card is a receipt with the grade stamped on it */}
          <section className="mx-auto max-w-[480px]" aria-label="Score card">
            <div className="fs-receipt shadow-ui">
              <p className="fs-r-title">FillScore</p>
              <p className="c mt-1">SCORE CARD</p>
              <p className="c g">{source === 'synthetic-demo' ? 'SYNTHETIC TRADER, REAL PRICES' : 'YOUR EXCHANGE DATA, READ-ONLY KEY'}</p>
              <hr />
              <div className="flex justify-center py-4">
                <GradeChip grade={lead.grade} size="xl" label={`Grade ${lead.grade}`} />
              </div>
              <h1 className="c font-ui text-[2.25rem] leading-none font-black tracking-[-0.04em] text-ui-ink">{lead.score} <span className="text-base font-normal tracking-normal text-ui-graphite">out of 100</span></h1>
              <p className="c mt-2">{measured ? 'MEASURED SCORE (V2)' : 'RULE-BASED SCORE (V1)'}</p>
              <p className="c g">MEASURED AGAINST PUBLIC MARKET PRINTS</p>
              {measured && <p className="c g mt-2">RULE-BASED SCORE (V1): GRADE {v1.grade}, {v1.score} OUT OF 100</p>}
              <hr />
              <dl className="kv" style={{ gridTemplateColumns: '14ch minmax(0,1fr)' }}>
                <dt className="g">VENUE</dt><dd>{data.exchange}</dd>
                <dt className="g">PERIOD</dt><dd>{data.period}</dd>
                <dt className="g">TRADES</dt><dd>{data.topStats.tradesAnalysed}</dd>
                <dt className="g">MAKER SHARE</dt><dd>{data.topStats.makerRatio}</dd>
                <dt className="g">AVG SLIPPAGE</dt><dd>{data.topStats.avgSlippageBps} bps</dd>
                <dt className="g">BEST SYMBOL</dt><dd>{data.topStats.bestSymbol}</dd>
              </dl>
              <div className="mt-4 flex justify-center"><ProvenanceChip dataSource={source} /></div>
            </div>
            <div aria-hidden="true" className="fs-torn-bottom" />
          </section>

          <div className="mt-8 flex flex-col items-center gap-5 text-center">
            <p className="text-[15px] text-ui-graphite">How well did your own orders execute?</p>
            <Link href="/" className={buttonClass('primary', 'md', 'no-underline')}>Get your FillScore</Link>
            <ShareButtons shareUrl={`${process.env.NEXT_PUBLIC_SITE_URL || ''}/share/${userId}`} grade={lead.grade} score={lead.score} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
