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
- **The standard licence page itself could not be read.** `https://gsap.com/standard-license/` and `/community/standard-license/` returned a "Forums Temporarily Offline" notice with no licence text (HTTP 200, 3,614 characters); the repository has no LICENSE file (the raw URLs return 404). I did not reconstruct the terms from memory.
- **Result: the terms and any restriction are NOT verified.** No conflict was found, because no text was available to conflict. This project does not build an animation tool or any product that competes with GSAP's owner, but that is my reading of a licence I could not read. **Before any production screen ships GSAP (M8 phase 2b), Deepanshu reads `https://gsap.com/standard-license` once the site is back, and this section is completed with its terms.** Until then GSAP is imported only by the design lab, which answers 404 in production (`app/design-lab/layout.tsx`).

## Other additions

| Package | Pinned version | Licence | Use |
|---|---|---|---|
| `@axe-core/playwright` | 4.14.0 | MPL-2.0 (package field) | dev only: accessibility scan of the design lab in Playwright |
| IBM Plex Sans, IBM Plex Mono, Hanken Grotesk, Schibsted Grotesk | via `next/font/google` (self-hosted at build) | SIL Open Font License 1.1, read 2026-11-19 in `github.com/google/fonts` (`ofl/ibmplexsans`, `ofl/ibmplexmono`, `ofl/hankengrotesk`, `ofl/schibstedgrotesk`, each `OFL.txt`; copyright lines: IBM Corp. 2017 for both Plex families, "The Hanken Grotesk Project Authors" 2021, "The Schibsted-Grotesk Project Authors" 2023) | design lab type specimens; the winners ship, the rest are dropped when the choice is made |
