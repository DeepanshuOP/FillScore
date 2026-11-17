# DRAFT blog 2 of 3 (pillar: Explained). For Deepanshu to edit and publish.

# An AI that is not allowed to write a number

A language model that explains your trading will, sooner or later, make a number up. In an audit tool that is the one failure that cannot be allowed. FillScore's rule is simple: **the model never produces a number.** Every figure on the screen comes from deterministic, tested code. The model may label, argue and explain.

## How the rule is enforced, not hoped for

- **Placeholders.** The model writes `{{namespace.key}}` where a number belongs. A renderer in code inserts the formatted value from the measured data.
- **Blocking grounding.** A number in the model's text that the renderer did not insert is a violation. The model gets one chance to regenerate with feedback; after that the offending sentences are deleted and recorded.
- **A claim check.** Causal language is removed ("because", "due to", "caused"), since the data show that things happened together, not why. The rules are versioned, and a recording is judged by the rules it was made under.
- **A counterfactual verifier.** When the model proposes a finding, code replays the user's own past trades to recompute the effect. A finding passes only if it is material and consistent with the others, and the dollar figure shown is the recomputed one.
- **Ask your execution.** You can ask a question about your own orders. A planner chooses among deterministic tools; code runs them; an answerer writes the words. The answer is shown only if it is plain ASCII, contains no number except a tool's value, and none of a long list of advising, forward-looking or cause-assigning words; otherwise the answer built by code is shown. I red-teamed the guards with 113 offline attack cases, which found three gaps (a blacklist that Unicode tricks got past, a model number that passed grounding, ids sent to the model), and a later independent review found more; all are fixed with tests.

## A Council, or one call?

FillScore offers a Quick audit (one model call, the default) and a Deep audit (a nine-call Council: four specialists, a prosecution and a defence, a synthesis). I do not claim the Council is better. The comparison of the two is small and on synthetic users, and I am re-recording it on the rebuilt demo data. Until then, the honest claim is about the guardrails: the same grounding, claim check and verification apply to both.

## What testing my own work found

The evaluation measure `evidence_cited` failed on all 18 recorded runs. I did not tune the model to pass it. I measured why: the evaluation asked for two values (the share of trades in the best hour, the total fee), but the prompt never named a required value, so the model chose what to cite. The test and the generator disagreed (`docs/research/LOG.md` §M). I fixed the contract, so the prompt now states the rule that the evaluation checks. The first number on the new recordings is still to come.

## What it will not do

It audits the past. It will not tell you what a future trade will do, and every sentence is a past-tense finding. It will not name a cause. It says "insufficient data" when the data are not there.

*Limits to state in the post:* models are free-tier models, so outputs vary; the ablation is small; demo users are synthetic.

## Sources for every claim above

| Claim | Source |
|---|---|
| Placeholders, grounding, verifier | `README.md`; `ml-service/agents/render.py`, `grounding.py`, `verification.py` |
| Claim rules and their version | `docs/research/LOG.md` §R; `ml-service/agents/claims.py` |
| Ask guards and the red team | `docs/milestones/M5.md` (table "Review"); `ml-service/tests/test_ask_redteam.py` |
| Quick and Deep | `docs/PROGRESS.md` (M3 §3-§4); `ml-service/main.py` |
| `evidence_cited` finding | `docs/research/LOG.md` §M |
