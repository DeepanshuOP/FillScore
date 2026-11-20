import Link from 'next/link'
import { buttonClass } from '../../ui/buttonClass'
import { HeroTape } from '../../ui/tape/HeroTape'

/**
 * The chosen hero composition (variant A "split": copy left, tape right). Variant B "stage" lost and was deleted; the
 * reasons are in DESIGN.md section 12. The landing page (app/page.tsx) uses this composition.
 */
export default function HeroLab() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="aurora absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-8 pt-28 pb-24 lg:grid-cols-[0.9fr_1.25fr]">
        <div>
          <h1 className="display-xl text-ui-ink">Every past fill, held against the tape.</h1>
          <p className="mt-6 max-w-[48ch] text-lg leading-8 text-ui-graphite">
            FillScore replays each order you placed against the exchange&rsquo;s public prints of the same seconds, and writes down what it cost.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/dashboard?userId=demo-moderate" className={buttonClass('primary', 'lg', 'no-underline')}>Open the demo audit</Link>
            <Link href="/signup" className={buttonClass('secondary', 'lg', 'no-underline')}>Connect a read-only key</Link>
          </div>
        </div>
        <HeroTape />
      </div>
    </section>
  )
}
