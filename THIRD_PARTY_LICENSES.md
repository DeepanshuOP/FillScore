# Third-party licences added for the design work (M8)

This file lists dependencies added since M8 phase 2a began (2026-11-19), with the licence terms as far as they could be read. It is not a full inventory of every transitive package; `npm ls` and the lock files are the inventory.

## GSAP (animation library)

| Package | Pinned version | Licence field of the package | Where it is used |
|---|---|---|---|
| `gsap` | 3.15.1 | `Standard 'no charge' license: https://gsap.com/standard-license` | `frontend/app/lib/motion.ts` and client components of the design lab (`useGSAP`, `Flip`, core tweens). No other plugin is imported. |
| `@gsap/react` | 2.1.2 | `SEE LICENSE AT https://gsap.com/standard-license` | `useGSAP` in client components only |

**What was read on 2026-11-19, and what could not be.**

- The package files carry no licence text, only the URL above.
- The GSAP repository README (`github.com/greensock/GSAP`) states that the standard "no charge" licence is at `https://gsap.com/standard-license`, that the copyright is "Copyright (c) 2008-2026, GreenSock", and that GSAP is "100% FREE ... even for commercial use" with its plugins (SplitText, MorphSVG and the others) free as well.
- `gsap.com` shows the banner "GSAP is now free for everyone, thanks to Webflow's support!" and the footer "GSAP - A Webflow Product".
- On 2026-11-19 the licence page was down (a forum notice). **It was read on 2026-11-20 from https://gsap.com/community/standard-license/ (HTTP 200).** Title "Standard "No Charge" GSAP License"; "Effective date: April 30, 2025"; "Last modified date: May 30, 2025"; "Copyright (c) 2025, Webflow". The page also incorporates Webflow's Terms of Service (https://webflow.com/legal/terms); that page was not read.

**Terms (short quotes):**

- Commercial use: FAQ "Can I really use GSAP in commercial projects without paying anything?" Answer: "Yes, really! Commercial usage is covered under the standard license."
- Plugins: "All of GSAP including the plugins that were formerly "members-only"" can be used in commercial projects at no charge.
- Grant: "a non-exclusive, worldwide license to use, reproduce, display, and implement GSAP Products" "solely for Permitted Uses". Webflow keeps all intellectual property. No attribution is required; removing or altering "proprietary notices or branding" is forbidden. There is no redistribution or sublicensing clause.
- Restriction (III.1): no use for "Prohibited Uses" without prior written consent. A Prohibited Use is use of GSAP "in tools that allow users to build visual animations without code" that "encourages, induces, or materially assists in creating a solution that competes with Webflow's visual animation building capabilities". FillScore is an audit product and builds no animation tool. The FAQ says AI-generated code is not a Prohibited Use.
- Change: Webflow may modify the licence by posting revised terms, provided the change does not "result in any material degradation to the security, integrity, or functionality" of GSAP.
- Termination: Webflow "may terminate this GSAP License and revoke your access in its discretion" "if you fail to comply"; on termination use must stop and copies be destroyed.
- Not open source: the page says neither "open source" nor "proprietary". Webflow keeps ownership, the grant is limited to Permitted Uses and there is a field-of-use restriction; by the OSI definition this is not an open-source licence (our reading, not the page's words).

**Result:** nothing on the page contradicts the points in the orders of 2026-11-20 (commercial use at no charge including all plugins; a restriction for no-code visual animation tools that compete with Webflow; Webflow may modify or terminate; proprietary-free, not OSI open source). Two nuances: the competition test is "encourages, induces or materially assists" a competing tool (narrower than "could compete"), and termination is tied to non-compliance. The text is dated 2025; the live copy was not checked beyond the page's own "Last modified" line. Versions stay pinned.

## Other additions

| Package | Pinned version | Licence | Use |
|---|---|---|---|
| `@axe-core/playwright` | 4.14.0 | MPL-2.0 (package field) | dev only: accessibility scan of the design lab in Playwright |
| IBM Plex Sans, IBM Plex Mono, Hanken Grotesk, Schibsted Grotesk | via `next/font/google` (self-hosted at build) | SIL Open Font License 1.1, read 2026-11-19 in `github.com/google/fonts` (`ofl/ibmplexsans`, `ofl/ibmplexmono`, `ofl/hankengrotesk`, `ofl/schibstedgrotesk`, each `OFL.txt`; copyright lines: IBM Corp. 2017 for both Plex families, "The Hanken Grotesk Project Authors" 2021, "The Schibsted-Grotesk Project Authors" 2023) | design lab type specimens; the winners ship, the rest are dropped when the choice is made |
