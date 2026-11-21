---
name: eval-harness
description: Eval-driven development (EDD) framework for AI coding sessions — define capability and regression evals before coding, grade with code-based, model-based, rule, or human graders, and track pass@k and pass^k reliability. Use when defining pass/fail criteria for agent tasks, measuring agent reliability, building regression suites for prompt or agent changes, or benchmarking across model versions.
metadata:
  origin: ECC
tools: Read, Write, Edit, Bash, Grep, Glob
---
> Adapted from ECC (github.com/affaan-m/ECC), MIT License.


# Eval Harness

Define the evals before the change, run them after, and report what passed.

- **Capability evals** test something the code could not do before. **Regression evals** check that existing behaviour is unchanged. Write each as a list of checkable criteria.
- **Graders:** prefer code (tests, grep, build). Use a model grader only for open-ended output, with a rubric. Use a human for security-sensitive or ambiguous cases.
- **Reliability:** pass@k is at least one success in k tries. pass^k is all k succeed, and is the bar for release-critical paths.
- **Where evals live here:** `ml-service/evals/` (pytest and recorded golden sets), not `.claude/evals/`. After any council run, consistency eval or ablation, run `verify-council-run` before reporting a number.
- **Pitfalls:** overfitting prompts to known examples, measuring only happy paths, ignoring cost and latency drift, flaky graders in release gates.
