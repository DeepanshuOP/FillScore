# Design v5 step 3: SaaS features FillScore lacks

Each candidate is checked against the product line: FillScore audits past execution; it never predicts, signals or advises, every
number comes from deterministic code, provenance is explicit, published grades never change silently, free tier first. "Effort" is
S (a day or less), M (two to four days), L (a week or more), for one developer with tests. "Invariant risk" names the rule a careless
build would break and the guard that keeps it.

## Ranked top 8

| # | Feature | User value | Effort | Invariant risk and guard |
|---|---|---|---|---|
| 1 | **Period picker with comparison to the previous period** (presets: whole history, last 7 / 30 / 90 days, a calendar month, custom range; "against the previous period of the same length") | the first thing every analytics product offers (Plausible's "Last 28 days" and its per-tile change); a trader asks "did my costs go down after I changed how I trade?" and today cannot | M: the backend's summary routes take `from`/`to` (orders-summary, ledger, v2 figures over a window); the previous window is computed by the server; nuqs keeps it in the URL | **I1, I8**: the comparison is a past fact ("$31.20 against $44.05 in the 30 days before"), never "improved because"; no arrow coloured good or bad on money (DESIGN §12.3). **No fabricated data**: a window with fewer than the minimum measured orders reads "insufficient data" (the demos hold January 2024 only, so their "previous period" reads that). The v2 grade is *not* re-computed per window in v1 of this feature (a windowed grade is a new versioned score, I4); the figures are sums and medians |
| 2 | **Each fill against the public price at its second** (where public prints are stored) | the per-fill cost the Fills page now prints as "not computed"; a fill-level answer is what a trader checks first | M: the same rule as the broker-file check (last buyer- and seller-initiated print within 5 s before the fill, `csv_import/check.py`), run in ml-service over the stored windows, stored per fill with its method version | **I2, no fabricated data**: coverage is measured, not assumed: of the demo fills, 503 of 607 (moderate), 606 of 721 (aggressive) and 300 of 385 (disciplined) have a print on each side within 5 s before the fill in the stored windows (`docs/research/LOG.md` §AN step 4); the rest read "insufficient data: no print on one side within 5 s". Shown as a new measure beside v1, not a change to any grade |
| 3 | **Onboarding checklist** on Home for a new account (Connect a read-only key, first sync, first measured order, first evidence pack, optional: check a broker file) | the cal.com and Stripe pattern: a new account sees what to do next instead of empty pages; replaces most "not computed" states for new users (step 4 class c) | S | **I3**: the key step links to the read-only key guide and the refusal receipt; nothing else |
| 4 | **Sample-data switch** for a signed-in account without data ("Show sample data": a demo account in the same pages) | try every page before connecting a key; the app already supports `sample=1` | S | **I5**: a banner on every page while it is on ("Sample data: synthetic trader, real prices. Your own data is not shown."), the provenance chip, NOT SIGNED on receipts; a demo account stays read-only |
| 5 | **Changelog** (product changes and, separately, every scoring and method version with its date and what it changed) | trust: a grade's version is printed on the stamp; the changelog says what that version means and when it changed | S: a page rendered from a committed markdown file plus the version files (`scoring_v2/versions/*.json`) | **I4**: a published grade never changes silently; the changelog is the place that says so out loud, with the version hashes |
| 6 | **Usage page** in Settings (Ask and Council budget units used and left today, syncs this month, evidence packs, API key calls) | answers "why was my question refused?"; standard SaaS settings page | S: `GET /ml/agents/council/budget` exists; sync counts from the job collection | none beyond showing server counts only |
| 7 | **Saved views** (a filter set, the period and the tab under a name; shareable link for demo accounts) | returning users keep their way of reading the Orders and Fills ledgers | M: nuqs state, a small `views` collection per account | **I5** for shared links: a demo view carries the demo's provenance; a real account's view never becomes public |
| 8 | **Status page** (data sources: Binance market data and account API, Bybit, OKX; the last successful sync per connection; the time of the last measurement) | after step 0 a user can see whether a failed sync was Binance refusing our IP, not their key; standard SaaS trust page | S: `GET /api/preflight/exchanges` (now with `accountApi`) plus the sync status that already exists | must state only measured states and their times ("Binance account API: paused, 388 s left, as of 12:04 UTC"); no uptime percentages we do not measure |

## Considered, not in the top 8

| Feature | Why not now |
|---|---|
| Weekly emailed summary of past costs | high retention value, but sending email needs a provider account (Resend or similar, free tier) and a new credential: Deepanshu's approval (approval list). Copy would be past-tense figures from the server only. Ranked 9th; ready to propose when he wants it |
| Help search inside ⌘K (methodology, docs, glossary) | useful (M); ⌘K exists; ranked 10th |
| Keyboard shortcut sheet (`?`) | small value for a small set of shortcuts (S); add with the shell rebuild |
| API keys page | already exists in Settings (personal API keys); it moves into the new settings layout, no new feature |
| Workspace and roles | FillScore's users are single traders today; L effort and a security review for little value now |
| Alerts on new costly orders | would read as a signal about trading (I1 risk) unless it is strictly a past-tense notice after a sync; not proposed |
