# Launch channel drafts

Drafts only; nothing is posted. Read each community's rules yourself before posting (they change, and I did not check them). Post to a few
places, not all at once, and answer comments yourself. Every draft says what it is, what it is not, and its limits. None of them promises
a result, and none of them uses the words "compliant", "save money" or "alpha".

## Before posting

- Push (CI must be green; the deploy follows) and run `scripts/smoke_prod.sh`.
- The README top section is accurate for the day (it was rewritten on 2026-11-18; re-read the "does not do" list).
- Decide: a real-account validation first (strongest) or launch with the demos (still honest, weaker).
- Have the three blog drafts (`docs/launch/BLOG_*.md`) published somewhere you control, and link the first one.

## Show HN

**Title:** Show HN: FillScore, an open-source execution auditor for crypto traders (measures the past, never advises)

**Text:**
I built FillScore to answer one question from public data: how well were my orders executed? You connect a read-only exchange key (it refuses any key that can trade or withdraw). It reads your own past trades and measures, per order, the spread you paid, how far the price moved with you, what unfilled orders cost and your fees against your account's real rates. For Binance the spread is measured from public trades with the aggressor flag, not guessed.

Three rules shape it: it audits the past and never predicts or advises; a language model never produces a number (placeholders and code, a claim check, a counterfactual verifier); and claims are checkable (versioned scores with integrity hashes, signed evidence packs you can verify in the browser without uploading anything).

What it is not, yet: no real user has been scored (I have not traded on Binance), the expected-cost model is fitted on one month, and a few ideas (funding costs, DEX audit, zkTLS) are written up as "not now" with the reasons. The demos are synthetic traders on real prints.

Code, methodology and the research record (including what I got wrong along the way) are in the repo. I would like feedback on the method and the claims.

## Reddit (choose one or two communities; check their self-promotion rules first)

**Title:** I built an open-source tool that measures how well your crypto orders were executed (past only, read-only key)

**Body:** short version of the Show HN text, plus "Method and formulas are in the repo; the formulas are also a small pip package. Not financial advice, it does not tell you what to trade. Happy to be told where the method is wrong." Put the limits in the first comment too.

## X / Mastodon thread

1. "Your exchange's fee table is not your cost. Two 2026 studies of European retail crypto apps found round-trip costs from about 0.5% to over 6% (small samples, details in the repo). I built an open-source tool that measures what your own orders cost." (cite Frankfurt School 0.53% to 6.45%; TUM figures in `docs/research/MARKET_2026-11.md`)
2. "It reads past trades with a key that can only read, and measures spread, price movement, unfilled-order cost and fees against public Binance prints."
3. "A language model never writes a number. Placeholders, code inserts values, a claim check removes causal words, a verifier recomputes findings."
4. "Scores have versions and hashes. Evidence packs are signed; the verify page checks them in your browser, nothing uploaded."
5. "What it doesn't do yet: real-user validation, funding costs, DEX audit. Written up honestly. Repo: <link>"

## LinkedIn (for the project and the recruiting goal)

A short post in your own words: the problem, one result (the finding about the timing score is a good one: "my first measured timing score ranked my disciplined demo trader last; here is why and how I fixed it"), what you would do next, and the link. Say plainly it is a student project.

## Open-source recognition

- Make `fillscore-metrics` visible: publish it to PyPI yourself when you want (an outward-facing step I did not take); add a "good first issue" list (a second symbol in the calibration, a Bybit/OKX measurement, the Coinbase mapping check, the remaining lint warnings).
- Add the repository topics: `tca`, `crypto`, `execution-quality`, `mcp`, `fastapi`, `nextjs`.

## Do not

- Do not claim compliance with MiCA or SEC Rule 605: the pack "supports your documentation" and nothing more (the research note says why).
- Do not post a real account's numbers or screenshots without the owner's permission.
- Do not describe the Council as better than a single call: that comparison is small, on synthetic users, and its re-recording is parked.
- Do not describe the Council as an audit of the whole account: it audits one symbol and the page says which, with the fill counts.
