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
          <section className="panel mx-auto flex max-w-[560px] flex-col items-center p-8 text-center sm:p-10" aria-label="Score card">
            <p className="text-[13px] font-medium text-ui-graphite">FillScore</p>
            <h1 className="display-md mt-1 text-ui-ink">{lead.score} <span className="text-lg font-normal text-ui-graphite">out of 100</span></h1>
            <GradeChip grade={lead.grade} size="xl" label={`Grade ${lead.grade}`} className="mt-6" />
            <p className="mt-3 text-sm text-ui-ink">{measured ? 'Measured score (v2)' : 'Rule-based score (v1)'}</p>
            <p className="mt-1 text-[13px] text-ui-graphite">Measured against public market prints</p>
            {measured && (
              <p className="mt-4 text-[13px] text-ui-graphite">Rule-based score (v1): grade {v1.grade}, {v1.score} out of 100</p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <ProvenanceChip dataSource={source} />
              <span className="inline-flex h-6 items-center rounded-full border border-ui-rule px-2.5 text-xs text-ui-graphite">{data.exchange}</span>
            </div>
            <p className="mt-3 text-[13px] text-ui-graphite">{data.period}</p>

            <dl className="mt-8 grid w-full grid-cols-2 gap-x-6 gap-y-5 border-t border-ui-rule pt-6 text-left">
              <div><dt className="text-[13px] text-ui-graphite">Trades analysed</dt><dd className="mt-1 text-lg font-semibold text-ui-ink">{data.topStats.tradesAnalysed}</dd></div>
              <div><dt className="text-[13px] text-ui-graphite">Maker share of fills</dt><dd className="mt-1 text-lg font-semibold text-ui-ink">{data.topStats.makerRatio}</dd></div>
              <div><dt className="text-[13px] text-ui-graphite">Average slippage</dt><dd className="mt-1 text-lg font-semibold text-ui-ink">{data.topStats.avgSlippageBps} bps</dd></div>
              <div><dt className="text-[13px] text-ui-graphite">Best symbol</dt><dd className="mt-1 text-lg font-semibold text-ui-ink">{data.topStats.bestSymbol}</dd></div>
            </dl>
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
