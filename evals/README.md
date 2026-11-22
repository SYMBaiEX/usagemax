# Gateway smoke evaluations

The versioned synthetic dataset compares the same cases on two Sonnely routes for the same model. Its deterministic evaluator checks literal text and exact JSON values and structure. Reports include per-case pass results, input and output tokens, customer charge in USD millionths, and client-observed latency. Reports omit prompts and completion text.

Run the fixture gate locally with `bun scripts/gateway-eval.ts fixture`. It uses checked-in synthetic observations and the named fixture baseline. GitHub CI runs this command with no credentials or model calls. A missing or duplicate observation, a regression in a previously passing case, or a breached latency, token, or charge budget fails the gate.

To measure providers, supply `SONNELY_EVAL_API_KEY` through the environment and run `bun scripts/gateway-eval.ts sonnely --measure`. This explicitly measures four live requests, with a reservation limit of $0.005 each, and exits unsuccessfully when a content assertion fails.

For live regression gating, run `bun scripts/gateway-eval.ts sonnely path/to/live-baseline.json`. Choose a reviewed baseline in `sonnely` mode with the observed route, evaluator, dataset version, and budgets. The command requires a baseline file or explicit measurement before making any live requests. Fixture baselines cannot gate live results.
