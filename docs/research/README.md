# docs/research

FillScore's research record. It is kept **in the repo**, so it survives across chats and machines and can be cited from the code. Any new chat or agent starts here.

| File | What goes in it | Who updates it |
|---|---|---|
| `LOG.md` | Findings, numbers and design decisions, by topic, with the phase they came from | Every phase brief ends by appending its "research notes" here |
| `EXPERIMENTS.md` | One entry per experiment: question, setup, exact command, data, result, limitations, where the raw outputs live | Whoever ran the experiment |
| `decisions/ADR-NNNN-*.md` | Architecture Decision Records: context, decision, alternatives, consequences | When a design choice is made or reversed |
| `RELATED_WORK.md` | Papers and standards, one line on how each relates to FillScore | When a source is used |
| `../HANDOFF.md` | Current state and next steps, for starting a new chat or agent session | Overwritten at the end of every phase |
| `AUDIT_2026-11.md` | The full-project correctness and data-provenance audit | Once, then corrections appended |

## Rules
1. **Every number traces to a source:** a phase report, a persisted run id, a script output, or a test. Never from memory.
2. **Only append or correct, never rewrite history silently.** When a finding is superseded, add the correction with a date, and leave the old line marked `(superseded YYYY-MM-DD: …)`.
3. **State limitations next to every result** (sample size, synthetic vs real data, free-tier models).
4. **No secrets, emails or real users' data.** Only aggregate numbers, and only from consenting users.
5. Keep it plain and factual. The paper is written from this at the end.
