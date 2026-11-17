# ADR-0017: Differentially private baselines (a mechanism, not yet a product feature)

Date: 2026-11-18. Status: accepted as a tested library; not wired into the product.

## Context

FillScore's current baselines are built from public market data (prints), not from users, so they need no privacy protection. A later
feature, "what users like you paid", would aggregate figures across users. Publishing such an aggregate for a small group can reveal one
user's data. Differential privacy bounds that.

## Decision

`ml-service/dp_baselines/mechanisms.py`:

- **One value per user** (for example the user's own median cost), clipped to bounds `[lo, hi]` chosen without looking at the data, then
  shifted to `[0, hi - lo]`. Adjacency: adding or removing one user.
- **The Laplace mechanism** (Dwork and Roth 2014, Theorem 3.6: scale = sensitivity / epsilon). The sum has sensitivity `hi - lo`, the count 1.
- **The mean is a ratio of two noisy figures**, each with epsilon / 2, so one release costs epsilon (sequential composition, Theorem 3.16).
- **A `Budget` object** adds up the epsilons and refuses a release that would pass the total; a refused release spends nothing and reads nothing.
- **The minimum-users rule uses the noisy count.** Gating on the true count would reveal whether the data are near the threshold. The epsilon is
  spent either way, because the count was looked at. Below the threshold the answer is "insufficient data".
- The answer holds only the noisy figures, the noise scales and a 90% half-width of the sum's noise (b ln 10), so a reader can see how much the number can move.

## Not done, on purpose

- **Not wired in.** There are no real users, so there is nothing to release. A baseline shown to users also needs its own wording (a past-tense
  finding, "insufficient data" below the threshold) and a decision on epsilon.
- **Floating-point noise.** Naive floating-point Laplace noise has known attacks (Mironov 2012). The module says so. Before any release of
  real users' data it must use the snapping mechanism or a discrete mechanism, with a test that checks it.
- **Median and quantile releases, histograms, and per-symbol breakdowns** (each costs more budget and needs its own sensitivity argument).

## Tests

`ml-service/tests/test_dp_baselines.py` (18): noise mean and variance (2 b squared), the scale of a count, the sensitivity of the shifted sum,
the half-width formula, clipping, shifting, the noisy-count gate, exact budget accounting and refusal, the noise of a released mean against
its stated scales (200 users, epsilon 1: about 0.14), the keys of the answer, determinism for a seed, and refusal of bad parameters and non-finite values.
