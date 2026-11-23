import { PageHeader } from '../../components/PageHeader'
import { CheckClient } from './CheckClient'

export default function V5Check() {
  return (
    <main id="main">
      <PageHeader title="Check a broker file" description="Compare a broker’s export with Binance public prices, fill by fill. Nothing is stored." />
      <div className="px-4 pb-10 lg:px-8"><CheckClient /></div>
    </main>
  )
}
