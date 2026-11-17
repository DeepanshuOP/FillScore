# zkTLS feasibility spike (M7)

Date: 2026-11-18. Question: could FillScore let a user prove to a third party that an exchange trade-history response really came from the
exchange's server and was not edited, without giving the verifier an API key or a session? Result: **feasible in principle, not buildable
today as a product feature.** Nothing was built. Facts below come from a research pass over primary sources (GitHub repositories and
releases, tlsnotary.org, Reclaim's repositories and documentation, an IACR preprint); items marked "not confirmed" could not be read.

## What a TLS attestation can and cannot prove

- It proves that a server holding the certificate for a host sent these bytes in this TLS session (TLSNotary intro; Reclaim claim-creation
  document). For FillScore that would read: "this response came from `api.binance.com`."
- It does **not** prove completeness ("these are all the trades"): the response is whatever the server returned for the query. The honest
  wording would stay "this response came from that server at that time."
- Binance REST responses carry no signature of their own; only the TLS channel protects them (not confirmed from Binance documentation;
  stated as the reason a transcript attestation is the only available proof).

## Options

| | TLSNotary | Reclaim Protocol |
|---|---|---|
| Licence | Apache-2.0 or MIT | attestor AGPL-3.0; some SDKs MIT |
| Free | yes (open source) | self-hosting an attestor is possible; hosted pricing not confirmed (official pages gave 404) |
| Maturity as stated by the project | latest v0.1.0-beta.1 (2026-11-14), pre-release; README: "should not be used in production. Expect bugs and regular major breaking changes"; `tlsn-wasm` / `tlsn-js` "very experimental" | no maturity statement found; claims SOC 2 Type 2 and ISO 27001 on its docs home page |
| Who must be trusted | the verifier joins the TLS session (interactive), or trusts a Notary; the Notary server and client crates were removed in alpha.13 | the attestor, "to not collude with you" (its own problem statement) |
| TLS versions | TLS 1.2 only (TLS 1.3 "on the roadmap", also "no immediate plans") | 1.2 and 1.3 |
| Can the API key and signature be redacted | request parts can be redacted by the prover | yes: with TLS 1.3 "Key Update" for data sent to the server; a ZK method for TLS 1.2 (slower) |
| Offline verification by anyone with open-source code | not confirmed; interactive by default | not confirmed |
| Exchange providers that exist | none needed (generic) | Kraken: last 3 trades and profile age as a proof of an active session; Binance: KYC level, VIP tier, user id, volume; no full spot trade history; Coinbase: none found |
| Audits | none found | not found |

Others (vlayer: BSL 1.1, testnet; Opacity and zkPass: licence and openness not confirmed) were not considered further.

## Why not now

1. **Maturity.** The one fully open option states it should not be used in production and breaks often. FillScore's invariant is that a
   published claim must be true by construction; building the "verifiable" pillar on a beta protocol would risk a claim that later cannot be
   reproduced.
2. **Trust.** Both options need a live verifier or a trusted attestor. FillScore would become that party, which is the very trust the proof
   is meant to remove, or the user must run a verifier of their own.
3. **TLS version (measured, not a blocker).** `curl -v https://api.binance.com/api/v3/ping` on 2026-11-18 negotiated TLS 1.3, and the same request with `--tls-max 1.2` completed a TLS 1.2 handshake. So TLSNotary's TLS 1.2 limit would not stop it on this host, from this network, today; a server may change this at any time.
4. **Scope of what it would prove.** Only "this response came from that server", never completeness; the product would have to say so every time.
5. **Custom endpoint not confirmed** on Reclaim; its ready-made Binance and Kraken providers do not cover a full trade history.

## What FillScore already does, and what it can honestly add now

- Signed evidence packs (M5): an Ed25519 signature over a manifest of every file with its SHA-256, checkable in the browser or offline. They
  prove that FillScore's measurements of the stored data were not changed after FillScore produced them. They do not prove where the trades
  came from.
- A truthful provenance label already exists (`dataSource`). A small next step that needs no new protocol: record, in each stored fill's
  lineage, that it was fetched from the exchange's API at a stated time (the sync already knows this), and say in the pack that the origin
  of the fills rests on the user's own key and on FillScore's connector, not on a cryptographic proof.

## When to look again

When TLSNotary has a non-beta release with a documented verifier library that a third party can run alone, or when Reclaim documents a custom
provider for an arbitrary authenticated endpoint with an offline verifier. A narrow experiment then would be: a local Node or Rust prover that
attests one `myTrades` response with the key and signature redacted, checked by a verifier the user runs.

## Items to confirm before any build

Binance's statement on unsigned REST responses; whether a TLSNotary proof can be verified offline; Reclaim
pricing, limits, registration and custom providers; audits of either project.
