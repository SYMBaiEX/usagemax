# Gateway integration readiness

Sonnely currently publishes its customer-facing inference gateway from `fathom-relay`. The existing manual UsageMax export reads up to 100 settled requests and sends the settled customer charge through the local collector format. The first automatic integration keeps that export available and introduces project-scoped ingestion and reporting. Sonnely's ledger continues to own balances, credit holds, settlement, and payouts.

| Brief area | Existing capability | First slice and remaining work |
| --- | --- | --- |
| Server ingestion | Scoped device collectors, native and OTLP JSON batches, replay protection, limits and diagnostics | Project-specific ingest and reporting keys, a bounded receipt API, sender outbox and generated request types. Item validation reports, general-purpose backfill and eval client methods remain follow-ups. |
| Inference traces | Logical request IDs, trace and span IDs, optional latency and first-token timing | Private settled receipt timeline with timestamps when supplied. Queue, provider attempts, streaming, fallbacks, out-of-order stages and traces across services need a separate event contract. |
| Token accounting | Input, output, cache, reasoning and unclassified accounting | Preserve supplied receipt dimensions and missing values. Provider normalization by adapter, attempt and billed request counts, and non-token units remain follow-ups. |
| Reporting | Workspace views, public aggregate stats, data exports and WorkOS membership | Private project receipt range and detail APIs and an Admin reader. Full timeseries, grouping, percentiles, exports and saved project views need further rollout. |
| Costs and reconciliation | Distinct financial bases, provider imports and monthly variance views | Separate customer charge and provider cost with a stated evidence basis. Effective-dated provider rates, invoice matching, margin and financial-close coverage remain follow-ups. |
| Operational alerts | Workspace budgets, notifications and coverage checks | Ingest status and bounded outbox retries. Project anomalies, recovery notifications and identified probe metrics remain follow-ups. |
| Evaluations | Outcome labels for agent telemetry | Evaluation datasets, scores, reproducibility and CI gates are a subsequent slice. |
| Compute | Sonnely tracks compute runs and settlement separately | UsageMax compute ingestion, utilization and stale-run alerting remain follow-ups. |
| Privacy and trust | Workspace membership, RBAC, retention, audits and content allowlists | Private project keys and receipts bypass public projections. Customer-scoped project permissions and content-based evaluation need separate acceptance. |
| Sonnely acceptance | Manual export and the Admin ledger | Integrate at the shared settlement transaction, send asynchronously, and read reports after Admin authorization. Release evidence requires a deployed settled request, replay, revision and isolation checks. |

The [gateway integration guide](https://docs.usagemax.com/gateway) describes the first receipt contract. Track deployment acceptance separately from source and fixture tests.
