# ADR-0007: Drop "execution latency"; if anything, measure "order resting time" for limit orders

- **Status:** proposed
- **Date:** 2026-11-07
- **Phase:** audit 2026-11 (T2.13)

## Context
- **What the connectors store:** fill time only.
  - Binance myTrades `time` (`backend/src/services/TradeIngestionService.ts:93`);
  - Bybit `execTime` (`BybitClient.ts:127`);
  - OKX `ts` (`OKXClient.ts:124`).
- **What they do not store:** order creation or update time.
- **Why true latency is out of reach:** client send → matching engine latency needs client-side timestamps that read-only exchange history does not contain.
- **The T2.13 spec** ("`receivedAt − executedAt`") would measure our own ingestion delay, not execution latency.

## Decision
- Remove "execution latency" from the plan and from all copy.
- Optionally, once order endpoints are fetched (4b-1 order reconstruction), report **order resting time** = first fill time − order creation time, for limit orders, under that name.

## Alternatives considered
- **Building T2.13 as specified:** produces a number that does not mean what its label says.

## Consequences
No latency feature. Resting time becomes available as a by-product of order reconstruction.
