# AI-Guided Trend Research System

## Project Specification and Implementation Plan

**Version 0.3 — July 22, 2026**

**Purpose:** test whether a skilled individual using frontier AI can compress an institutional-grade quantitative research capability into a low-touch, auditable system that identifies trends, produces protected actions, builds domain competence, and improves as frontier models advance.

## Executive decision

Build one common trend engine across **GLD, SPY and TLT**, then extend it to liquid individual equities. Use daily adjusted data, weekly decisions, local **DuckDB** storage and deterministic paper signals. Only after out-of-sample evidence is credible should the signals be executed through leveraged products or meaningful live capital.

The project is **AI-authored and code-executed**. Frontier models formulate measurements, write and revise research code, interpret summarized results and propose improvements. Local Python performs ingestion, feature calculation, backtesting and weekly signal generation.

This is not a claim that quantitative investing or trend following is new. The central experiment is whether frontier general-purpose AI has changed the minimum viable scale, cost and coordination structure of credible quantitative research.

## Foundational thesis and origin

This project began with a broader question: **where should AI be put to work if the goal is to align transformation with the capabilities receiving the strongest and most persistent investment from frontier laboratories?**

The working thesis is that laboratories pursuing increasingly capable AI and recursive self-improvement must improve mathematics, algorithms, software engineering, experimentation, evaluation, debugging, tool use and coordination. Coding is the execution layer built on those deeper abilities. Work redesigned around the same axes should benefit repeatedly from the largest AI research effort in history.

The practical proof point came from tax-provision work. AI could code the calculation body and the rate reconciliation, with the reconciliation acting as an explanatory proof that the statutory-to-effective-rate differences were identified. This showed an ability to construct and check a formal system rather than merely write isolated formulas.

That also exposed calibrated trust. Kyle can verify a tax provision because he understands its invariants and failure modes. He cannot yet verify an unfamiliar calculation engine with the same confidence. Trust should be earned where results can be independently judged, then transferred cautiously.

The market experiment applies the same thesis outside tax. Markets do not have mathematical constancy and unforeseen events defeat exact forecasts. They do produce measurable movement: direction, velocity, acceleration, persistence, weakening, structural breaks and reversal. The target is therefore **market-state estimation and disciplined action**, not precise prediction or market commentary.

The project has two linked subjects:

1. Whether the market system works.
2. Whether a capable individual can use frontier AI to assemble, coordinate and improve a research capability that previously required a specialist organization.

> **Second-brain summary:** Align transformation with the capability axes frontier laboratories must improve. Give AI a measurable domain, let it propose methods beyond inherited practice, make code perform the numerical work, verify results out of sample, and convert uncertainty into bounded action through stops and position sizing.

## What is novel, and what is not

Systematic investing, machine learning, trend following, stop-based risk management and algorithmic feature discovery are established fields. Bridgewater describes a long-running effort to build an artificial investor, while Two Sigma describes AI as accelerating research workflows and multiplying testable hypotheses.

The experiment does not assume a retail operator will discover an obvious pattern that sophisticated firms missed. A useful result may instead rediscover a published method, reproduce an unpublished institutional insight, combine known methods more effectively, or identify a real but low-capacity opportunity that is immaterial to a large fund.

The distinctive hypothesis is that frontier AI has changed the **minimum viable scale of quantitative research**.

| Dimension | Established reality | Experiment-specific proposition |
|---|---|---|
| Investment method | Quantitative and AI-assisted investing are longstanding. | No claim of a new investment paradigm. |
| Capability access | Specialist teams were historically concentrated in large institutions. | Frontier AI makes much of the stack accessible to one operator. |
| Coordination | Quant, engineering, data, risk and operations are separate functions. | Specifications and agents may compress coordination into a smaller system. |
| Capacity | Large firms must deploy enough capital for a strategy to matter. | Small capital can pursue trades or niches irrelevant at institutional scale. |
| Behaviour | Sound strategies can fail through inconsistent execution. | The experimental frame may create discipline and measurable behavioural value. |
| Trajectory | Older algorithms were designed and periodically revised. | The apparatus can be repeatedly upgraded as frontier models improve. |

## Coordination compression and externalized organization

One person working with multiple agents does not eliminate coordination. It changes its form. The danger is that complexity moves into hidden prompts, disconnected chats and assumptions Kyle must hold in working memory.

The system must externalize its organization through durable artifacts: project thesis, decision log, agent charters, data lineage, experiment manifests, strategy versions, model cards, weekly records and promotion decisions.

**Governance principle:** Kyle acts as principal investigator, capital governor and learner—not as the memory bus connecting every agent. No important conclusion should exist only inside a chat.

## The instrument-and-genre learning model

The AI is the instrument; quantitative investing is a new genre.

Kyle is inexperienced in quantitative investing, but he is not beginning from zero in directing AI. Since ChatGPT's release in November 2022 and more intensive use beginning in spring 2023, he has developed transferable skill in decomposing work, directing and correcting models, eliciting code, preserving context, debugging, recognizing shallow output, structuring long projects and coordinating tools.

The remaining learning curve is the genre itself: market structure, validation, execution, portfolio risk and the characteristic ways financial research creates false confidence.

The tax-provision experience demonstrated that domain expertise remains necessary for consistently high-quality outcomes. This project must build domain competence alongside the system through transparent baselines, external research, validation controls, documented learning and independent review.

The strategic wager is that the instrument will keep improving along exactly the capabilities this project uses—mathematics, reasoning, coding, experimentation, tool use and agent coordination. A modular system built now should benefit without requiring complete reconstruction.

## Decision record

| Decision | Status | Reason |
|---|---|---|
| State measurement rather than exact prediction | Adopted | Trends can be measured and acted upon without pretending shocks can be forecast. |
| Existing technical analysis as seed knowledge | Adopted | It contains useful compressed observations. |
| AI-created features and combinations | Adopted | The experiment should test capabilities beyond named indicators. |
| Weekly decisions from daily data | Adopted | Fits a side-of-desk project and multi-week trends. |
| Local code for calculation; frontier models for design and review | Adopted | Controls API costs and concentrates model use where it adds value. |
| Protective stops and risk sizing | Adopted | Failed signals become bounded losses. |
| Complete clean room | Rejected | The purpose is useful discovery, not proving ignorance of prior knowledge. |
| Classical chart patterns as the full search space | Rejected | They must compete with AI-created measures. |
| Market commentary as the engine | Rejected | The objective is measurable state and action. |
| Options and 3x products first | Deferred | They obscure whether the underlying signal works. |
| One asset indefinitely | Rejected | Evidence accumulates slowly and may depend on one regime. |
| Individual equities | Phase two | They provide concentrated trends and a harder test of gap and event risk. |
| Claim a novel investment paradigm | Rejected | Quantitative, systematic and AI-assisted investing are established. |
| Test the minimum viable scale of quantitative research | Adopted | Capability access and coordination compression are central subjects. |
| Assume useful patterns must be undiscovered | Rejected | They may be known, unpublished or institutionally uneconomic. |
| Treat small-capital freedom as part of the opportunity | Adopted | The system can pursue low-capacity trades, remain in cash and avoid market impact. |
| Make domain learning an explicit output | Adopted | AI skill raises the starting point but does not remove the domain-learning requirement. |
| Externalize multi-agent coordination | Adopted | The operator should not hold the complete system in working memory. |
| Measure model action, execution and override pressure separately | Adopted | This separates analytical, behavioural and operational value. |

## Project objective

The engine answers:

- Is a tradable trend beginning, established, weakening or broken?
- Should the system enter, hold, tighten protection, exit or remain in cash?
- What price invalidates the position?
- What position size keeps intended account loss within the risk budget?
- Is the system improving analytical decisions, behavioural discipline or both?

The first version excludes intraday trading, options, 3x ETFs, news commentary, a large asset universe, automated brokerage execution and a polished production UI.

## Layered definition of success

Profit matters, but it is not the only useful outcome. A leveraged gain can arise from beta, concentration or luck.

| Layer | Success test |
|---|---|
| Build | One operator and frontier AI create the end-to-end system. |
| Reproducibility | Data, experiments, signals and trades can be rerun and audited. |
| Coordination | Multiple agents contribute without requiring Kyle to retain the whole project in his head. |
| Learning | Kyle's quantitative-finance judgment improves. |
| Behaviour | The process reduces emotional entries, premature exits, oversized positions and undocumented overrides. |
| Research | The AI-enhanced engine adds stable out-of-sample value beyond transparent baselines. |
| Financial | The live process earns positive returns after costs at acceptable drawdown. |
| Trajectory | Stronger future models improve the system without architectural replacement. |

## Research questions

1. Can an AI-designed engine identify trend initiation, continuation, weakening and failure across different regimes?
2. Do AI-created measurements add value beyond conventional indicators?
3. Do cross-asset relationships improve decisions?
4. Can weekly decisions capture enough of multi-week and multi-month trends?
5. Does 2x leveraged execution improve results after costs and path effects?
6. Does the engine generalize from broad instruments to individual companies?
7. Can frontier AI compress an institutional quantitative capability stack to one operator?
8. Does the system create measurable behavioural value?
9. Does prior skill with the AI instrument accelerate learning in a new domain?
10. Can the research system improve as frontier models improve?

## Initial universe and horizons

| Role | Signal | Later 2x execution |
|---|---|---|
| Gold | GLD | UGL |
| Broad US equities | SPY | SSO |
| Long Treasuries | TLT | UBT |

Use three time layers:

- Structural regime: roughly 126–378 trading days.
- Tradable trend: roughly 20–80 trading days.
- Entry and protection: roughly 5–20 trading days.
- Decision schedule: weekly after Friday close.

## Individual equities as a second research cohort

Individual companies can produce concentrated trends but add company-specific gaps that stops cannot fully contain.

- **AAPL:** mature, liquid and long history.
- **NVDA:** momentum and acceleration stress test.
- **TSLA:** volatile and reflexive; a demanding whipsaw and gap test.
- **SPCX:** too little listed history for regime backtesting; use forward paper observation first.

Apply one common architecture. Store scheduled earnings dates and test explicit hold, reduce, exit or no-new-entry policies around earnings. Use ordinary shares before leveraged single-stock ETFs.

## Data strategy

Required: adjusted and raw daily OHLCV, dividends, split factors, metadata and actual leveraged ETF histories. When individual equities are activated, add scheduled earnings dates preserved as-of when known.

Recommended acquisition path:

1. Test Tiingo individual EOD access.
2. If history or terms are insufficient, use one month of Alpha Vantage Premium to seed long adjusted daily history.
3. Store immutable raw Parquet snapshots and normalized records in `data/curated/market.duckdb`.
4. Reconcile prototype-only sources before final validation.

## Repository and second-brain structure

```text
trend-lab/
  config/
    assets.yaml
    research.yaml
    risk.yaml
  data/
    raw/<provider>/<ingestion-date>/*.parquet
    curated/market.duckdb
  src/trendlab/
    data/
    features/
    states/
    backtest/
    portfolio/
    reporting/
    orchestration/
  tests/
  experiments/
  reports/
  weekly/
  docs/
    THESIS.md
    DECISIONS.md
    AGENT_ROLES.md
    DOMAIN_GLOSSARY.md
    SECOND_BRAIN_INDEX.md
    MODEL_CARDS/
```

Core records include market data, feature sets, states, signals, experiments, trades, overrides, agent runs, weekly reflections and indexed knowledge artifacts.

## Feature engine

Seed feature families include direction, slope, breakouts, velocity, acceleration, volatility, range compression, path efficiency, pullback depth, price-volume structure, candlestick geometry, structural-change measures and cross-asset relationships.

The AI may generate new transformations and interactions. A candidate survives only when it improves walk-forward performance, remains stable across folds and passes ablation testing.

## State vocabulary

- `NO_TREND`
- `EMERGING`
- `ESTABLISHED`
- `WEAKENING`
- `BROKEN`
- `UNSTABLE`

Weekly actions are `ENTER`, `HOLD`, `TIGHTEN`, `EXIT` or `CASH`.

## Validation

Use buy-and-hold, cash and one transparent trend strategy as baselines.

Use rolling or expanding walk-forward testing:

1. Develop within a historical window.
2. Freeze the selected configuration.
3. Test on the next unseen segment.
4. Advance and repeat.
5. Aggregate out-of-sample results.
6. Review by asset and broad regime.

Prevent leakage through next-bar fills, time-aware splits, corporate-action handling, purging or embargo where needed, and complete experiment manifests.

Measure return, drawdown, trade expectancy, trend capture, false starts, whipsaw loss, fold stability, asset stability and profit concentration. Attribute results against buy-and-hold, unlevered execution, simple trend baselines, concentration and leverage.

## Research, candidate and operating engines

- **Research engine:** may change freely and runs experiments.
- **Candidate engine:** proposed replacement that must pass identical tests.
- **Operating engine:** frozen during a defined paper or live evaluation block.

## Human-machine governance

| Role | Responsibility | Authority boundary |
|---|---|---|
| Kyle — principal investigator | Objectives, risk approval, domain learning, execution and promotion decisions. | Overrides must be logged. |
| Research architect | Hypotheses, features and experiment plans. | Cannot promote a live model. |
| Data engineer | Acquire, validate and version market data. | Cannot modify research rules. |
| Quant implementation agent | Features, backtests, sizing and reports. | Must follow protocol and tests. |
| Validation auditor | Search for leakage, overfitting and misleading attribution. | Independent from proposing agent. |
| Portfolio and risk agent | Stops, account risk, portfolio heat and leverage rules. | Cannot loosen approved limits. |
| Knowledge curator | Thesis, decisions, glossary, model cards and indexes. | Cannot change decisions silently. |

Agent roles may initially be performed sequentially by the same model. Parallel agents are added only where they reduce work without obscuring responsibility.

Every material run records the model, role, input artifacts, output artifacts, code commit and experiment IDs.

## Weekly workflow

1. Fetch missing bars after Friday close.
2. Validate data.
3. Calculate features, states and stops.
4. Produce actions.
5. Kyle reviews and initially places any order.
6. Broker-held protective stops remain active.
7. Record model instruction, actual execution, urge to override and reason before the outcome is known.
8. Periodically compare model-only, executed and override-adjusted results.

## Capital and leverage

- Paper first.
- Initial live risk: 0.25%–0.50% of closed account equity per trade.
- Maximum portfolio heat: 1.0%.
- Ordinary ETFs first; 2x execution only after validation.
- Compound from closed equity using a fixed risk percentage.
- No averaging down or 3x ETFs in version 1.

## Knowledge capture

Every important insight is classified as thesis, decision, hypothesis, method, result, operating rule or learning note.

The repository is the authoritative project memory. `docs/SECOND_BRAIN_INDEX.md` contains concise, curated summaries and links suitable for transfer into Kyle's wider second brain.

No critical project context may exist only inside chat history.

## First milestone

Produce a repository that can:

1. Download and validate GLD, SPY and TLT daily history.
2. Preserve raw data and load DuckDB.
3. Run one transparent weekly trend baseline without look-ahead.
4. Backtest through configurable walk-forward folds.
5. Model next-bar fills, fees, slippage, stops and risk sizing.
6. Generate reproducible HTML and JSON reports.
7. Show the latest weekly state and action.
8. Maintain the thesis, decision log, agent roles and domain glossary.

Do not build the full AI discovery engine or polished UI before the baseline works end to end.

## Codex/Fable kickoff prompt

```text
You are implementing the first milestone of the AI-Guided Trend Research System.

Read docs/PROJECT_SPEC.md in full. Build only the data foundation, transparent baseline
engine, walk-forward backtester, risk sizing, and generated HTML/JSON report. Do not add
a polished web UI, brokerage execution, options, intraday data, or complex machine learning.

Requirements:
1. Python 3.11+, typed code, clear module boundaries, pytest coverage, and useful errors.
2. Provider-neutral EOD data interface with one working provider adapter.
3. Immutable raw Parquet snapshots and a normalized DuckDB database.
4. GLD, SPY and TLT daily adjusted OHLCV.
5. No look-ahead: Friday signals execute at the next available bar.
6. Configurable transaction costs, slippage, stops, and account-risk position sizing.
7. Configurable walk-forward folds and complete experiment manifests.
8. One simple, auditable baseline trend model.
9. HTML and JSON reports containing metrics, drawdown, trades and latest weekly actions.
10. README setup and command examples.
11. Create docs/THESIS.md, docs/DECISIONS.md, docs/AGENT_ROLES.md and docs/DOMAIN_GLOSSARY.md.
12. Record agent/model provenance and ensure no critical context exists only in chat history.

Before coding, write an implementation plan and identify any specification conflicts.
Do not silently change the research protocol. Record decisions in docs/DECISIONS.md and
detailed architecture decisions in docs/decisions/. Run tests and the end-to-end sample
pipeline before declaring the milestone complete.
```

## Sources

- Tiingo EOD: https://www.tiingo.com/documentation/end-of-day
- Alpha Vantage docs: https://www.alphavantage.co/documentation/
- Alpha Vantage Premium: https://www.alphavantage.co/premium/
- Twelve Data pricing: https://twelvedata.com/pricing
- Massive pricing: https://massive.com/pricing
- DuckDB Python: https://duckdb.org/docs/lts/clients/python/overview
- DuckDB Parquet: https://duckdb.org/docs/lts/data/parquet/overview
- UGL: https://www.proshares.com/our-etfs/leveraged-and-inverse/ugl
- SSO: https://www.proshares.com/our-etfs/leveraged-and-inverse/sso
- UBT: https://www.proshares.com/our-etfs/leveraged-and-inverse/ubt
- Claude Fable 5: https://www.anthropic.com/claude/fable
- NVIDIA investor FAQ: https://investor.nvidia.com/investor-resources/faqs/default.aspx
- Tesla investor FAQ: https://ir.tesla.com/contact-us
- Apple investor FAQ: https://investor.apple.com/faq/default.aspx
- SpaceX investor relations: https://ir.spacex.com/investors/default.aspx
- SEC leveraged ETF bulletin: https://www.sec.gov/investor/pubs/leveragedetfs-alert.htm
- Bridgewater AIA Labs: https://www.bridgewater.com/aia-labs
- Two Sigma AI in Investment Management: https://www.twosigma.com/articles/ai-in-investment-management-2026-outlook-part-i/

> This is an experimental research and software specification. Historical and paper results cannot establish future profitability. Leveraged products, gaps, slippage and operational failures can cause losses beyond the intended stop.
