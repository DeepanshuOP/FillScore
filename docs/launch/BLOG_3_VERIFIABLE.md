# DRAFT blog 3 of 3 (pillar: Verifiable). For Deepanshu to edit and publish.

# Don't trust the score. Check it.

A score from an app is a claim. FillScore tries to make its claims checkable by someone who does not trust FillScore.

## Three things you can check

1. **The score has a version and a hash.** Each v2 score is made under a committed version file and carries an integrity hash. `GET /api/audit/verify` recomputes the hash from the stored inputs and the version file and says whether it matches. Published grades never change silently: the original rule-based score (v1) is frozen, and any new scoring is a new, versioned score next to it.
2. **Every number has lineage.** A measured order stores the public market-data files it used, each with a SHA-256. You can fetch the same public data and recompute.
3. **Evidence packs are signed.** A pack is a set of files (the measurements, the data references, the limits) plus a manifest that lists each file with its size and SHA-256. The manifest is signed with Ed25519. The public key's fingerprint is `ba11aa53c4961be4`, and you can check a pack:
   - **in your browser** on the verify page. The file is read on your device and not uploaded. A test records every request the page makes and checks that none carries the pack;
   - **offline**, with one Node script and nothing to install.

   The verify page says "valid" only when you give it a key you trust, by fingerprint or as a PEM. Without one it says "consistent", with the sentence that anyone can make a pack that is consistent with their own key, so this does not show where it came from. The best-execution pack says it "supports your documentation". It never says "compliant", and a test searches every file for such words.

## What a pack does not prove

A signed pack proves that FillScore's measurements of the stored data were not changed after FillScore produced them. It does **not** prove that the trades came from the exchange: that rests on your own read-only key and FillScore's connector.

I looked at proving that too, with zkTLS (TLSNotary, Reclaim). My conclusion is: not yet. TLSNotary's own README says it should not be used in production and breaks often; both options need a live verifier or an attestor you must trust; and a transcript proof can show only that a response came from a server, never that the list is complete. I measured one practical point: `api.binance.com` negotiates TLS 1.3 and also accepts TLS 1.2. I will look again when the protocols mature (the note says what to check).

## Keys, in plain words

You connect a key that can only read. FillScore asks the exchange what the key can do and refuses it if it can trade or withdraw. It stores keys AES-256-GCM encrypted and never returns or logs them. The same care applies to the keys FillScore gives you: a personal API key for the MCP server is shown once, stored only as a hash, expires, can be revoked, and can read six things and nothing else.

*Limits to state in the post:* no real user has been scored yet; the pack's origin claim is limited as above; an independent security review has been done (see `docs/milestones/M9.md`), but this is a student project, not an audited product.

## Sources for every claim above

| Claim | Source |
|---|---|
| Version file, hash, verify route | `docs/milestones/M1.md`; `backend/src/routes/audit.ts` |
| Lineage | `ml-service/measure/service.py`; `docs/research/LOG.md` §H |
| Packs, signature, key fingerprint | `docs/milestones/M5.md`; `docs/research/LOG.md` §T; `backend/src/services/evidencePack.ts` |
| Browser check, no upload | `frontend/app/lib/evidenceVerify.ts`; `frontend/e2e/verify-pack.spec.ts` |
| zkTLS verdict, TLS versions | `docs/research/ZKTLS_FEASIBILITY.md` |
| Key handling | `backend/src/services/keyValidation.ts`; `docs/research/decisions/ADR-0016-personal-api-keys.md` |
