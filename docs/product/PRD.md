# FillScore: product requirements (one page)

Written 2026-11-22 from the repository. Status words follow `docs/STATUS.md`. Nothing here is a forecast of a market or of users.

## Problem

A retail or prosumer crypto trader sees a posted fee and a fill price. They do not see what the order cost against the market at the moment
it arrived: the spread paid, how far the price moved with the order, the fee against the rate the account qualifies for, and what
orders that never filled cost. Institutional desks buy transaction-cost analysis (TCA) for this. The tools are closed, priced for institutions,
or grade the vendor's own routing (`docs/agent/MASTER_BRIEF.md`, "What FillScore is"; sources in `docs/research/MARKET_2026-11.md`).

## Users

1. **A trader with an exchange account** who wants an independent, explainable audit of orders already placed.
2. **A small desk or broker** that must show how it checked execution (MiCA Article 78 is the stated reason in the master brief). The evidence
   pack is worded "supports your documentation", never "compliant".
3. **A reviewer** (an auditor, a client, an interviewer) who needs to check a result without trusting FillScore: the `/verify` page and the
   offline verifier `scripts/verify_evidence_pack.mjs` check a signed pack against a published key fingerprint.

## What it does

- Connects a **read-only** exchange key. A key that can trade or withdraw is refused before storage; stored keys are AES-256-GCM encrypted.
- **Measures** each fill and each order against real public prints (Binance publishes every trade with its aggressor side): execution
  cost, fees at the account's real rates, unfilled orders. Score v2 is versioned and carries an integrity hash that the API can recompute.
  Score v1 (rule-based) is frozen; its published demo grades never change.
- Shows **cost against expectation** for market orders, with an interval, or the words "insufficient data".
- **Explains** with language models under three rules: a model writes placeholders and code inserts the numbers; a claim check removes causal
  and advice wording; a replay verifies each counterfactual. The Council audits **one symbol** and says so, with the served fill counts.
- **Proves**: signed evidence packs, a verify page, a key fingerprint, a read-only MCP server and an MCP App scorecard.
- Offers three **demo accounts** whose trading behaviour is synthetic and whose prices are real (January 2024).

## What it refuses to do

- It never predicts, signals or advises. Copy is past-tense findings; a test bans advice and counterfactual words.
- No number comes from a language model; none is computed in the browser.
- A value that was not measured reads "insufficient data" or "not computed", never zero.
- Correlation, never causation: "coincided with", never "caused".
- It never holds a key with trade or withdraw rights, and never changes a published grade silently.

## Success metrics for launch

Counted from data the product already records. **Baseline today: no real user has been scored** (`docs/STATUS.md`, README). Targets are
for Deepanshu to set; none is stated here because none has been measured.

| Metric | How it is counted | Source |
|---|---|---|
| Users scored | Accounts with `dataSource: 'real-user'` that have a measured v2 score | `accounts` and the stored v2 grade; `ml-service/scripts/validate_real_account.py` for the first one |
| Audits run | Daily counts of `quick_audit` and `deep_audit` (anonymous, no user id; demo views are not counted) | `backend/src/models/AnalyticsDaily.ts` (`ANALYTICS_EVENTS`) |
| Verified packs | Daily count of `evidence_pack_download`. The verify page runs in the browser and sends no event, so completed checks are **not** counted: a stated gap | same file; `/verify` |

## Non-goals

- Trade signals, price predictions, advice on what to trade or where to route.
- Custody, order placement, or any exchange permission beyond read.
- A claim of regulatory compliance. The pack "supports documentation".
- Perpetual funding costs, an EVM DEX wallet audit, and proof of where trades came from (zkTLS): not built (`docs/STATUS.md`).

## Risks

| Risk | State |
|---|---|
| No real account has been scored; v2 is validated on synthetic behaviour with real prices | open; one-command harness exists |
| The three demos all read A under v2.3.0, so the score does not separate the synthetic profiles | open question for Deepanshu (`docs/STATUS.md`) |
| The cost-vs-expected model is fitted on one month (January 2024) and says so | stated in the product |
| Free-tier language models: rate limits and fallback sentences; the recorded demo runs are mostly code-built sentences | stated in `docs/research/LOG.md` §AH |
| Free hosting sleeps; the first request can take about a minute | accepted |
| An audit reads as advice, which is the legal line | tests ban advice wording on every user-facing surface |
| The Council covers one symbol, not the account | stated on the page since 2026-11-22 |
