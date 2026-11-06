# Related work

One line on how each source relates to FillScore. Add sources as they are used.

- **FinGround** (arXiv 2604.23588, ACL 2026): atomic claim verification for financial QA; generic detectors miss 43% of computational errors. FillScore prevents numeric errors by construction (placeholders) rather than detecting them after the fact.
- **Agentic Trading: When LLM Agents Meet Financial Markets** (arXiv 2605.19337): survey; only 1/19 primary studies report an explicit transaction-cost model; recommends log-to-narrative verification.
- **Execution Realism and Reproducibility in LLM-Based Trading Systems** (arXiv 2606.08285): scoping review on execution realism.
- **Can Agentic Trading Systems Pay for Their Own Intelligence? / TradeLens** (arXiv 2607.10286): cost-aware evaluation of LLM agents; relates to our Council vs single-call cost ratio.
- **Reasoning Externalization for Faithful LLM Narratives of Stock Return Predictions** (arXiv 2609.38869): faithful narratives of model outputs.
- **Markov, Bayesian Trading Cost Analysis and Ranking of Broker Algorithms** (Bloomberg, arXiv 1904.01566): basis for noise-aware rankings.
- **Donier & Bonart, A Million Metaorder Analysis of Market Impact on the Bitcoin** (arXiv 1412.4503): square-root impact law on Bitcoin; basis for the expected-cost model.
- **Corwin & Schultz (2012), J. Finance 67(2):719–760**: high-low spread estimator.
- **Abdi & Ranaldo (2017), RFS 30(12):4437–4480**: close-high-low spread estimator.
- **MAPIE** (arXiv 2207.12274): conformal prediction intervals.
- **SEC Rule 605 amendments** (effective-over-quoted spread, realized spreads): metric vocabulary.
- **MiCA Article 78** (best execution for CASPs; enforceable from 1 Jul 2026): regulatory motivation.
- **TUM (Apr 2026) and Frankfurt School (2026) retail crypto cost studies**: round-trip costs of 0.53%–7.49%; hidden spreads on broker-model apps.
- **tcapy** (Cuemacro, Apache-2.0): open-source TCA library; prior art for open metrics.
