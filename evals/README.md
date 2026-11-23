# Gateway smoke evaluations

The versioned synthetic dataset compares the same cases on two Sonnely routes for the same model. Its deterministic evaluator checks literal text and exact JSON values and structure. Reports include per-case pass results, input and output tokens, customer charge in USD millionths, and client-observed latency. Reports omit prompts and completion text.

Run the fixture gate locally with `bun scripts/gateway-eval.ts fixture`. It uses checked-in synthetic observations and the named fixture baseline. GitHub CI runs this command with no credentials or model calls. A missing or duplicate observation, a regression in a previously passing case, or a breached latency, token, or charge budget fails the gate.

To measure providers, supply `SONNELY_EVAL_API_KEY` through the environment and run `bun scripts/gateway-eval.ts sonnely --measure`. This explicitly measures four live requests, with a reservation limit of $0.005 each, and exits unsuccessfully when a content assertion fails.

For live regression gating, run `bun scripts/gateway-eval.ts sonnely path/to/live-baseline.json`. Choose a reviewed baseline in `sonnely` mode with the observed route, evaluator, dataset version, and budgets. The command requires a baseline file or explicit measurement before making any live requests. Fixture baselines cannot gate live results.

## Publish a hosted run

Use **Publish hosted gateway eval** in GitHub Actions to run the fixture manually on `main`. The workflow requires `USAGEMAX_GATEWAY_EVAL_INGEST_KEY` in the `gateway-evals` environment and uses `ci-<run_id>-<run_attempt>` as the run ID. To compare with a reviewed hosted run, supply its ID in `baseline_run_id`.

To run publication directly, inject a Gateway **Ingest** key for the intended project as `USAGEMAX_GATEWAY_EVAL_INGEST_KEY`. Set `USAGEMAX_GATEWAY_EVAL_RUN_ID` to an immutable identifier for this report. IDs are 1–64 characters, start with a lowercase letter or digit, and may also contain periods, underscores, and hyphens. `USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID` selects an optional baseline.

```sh
# Inject USAGEMAX_GATEWAY_EVAL_INGEST_KEY through the CI secret store.
USAGEMAX_GATEWAY_EVAL_RUN_ID=fixture-12345-1 \
  bun scripts/gateway-eval.ts fixture
```

Select your project under [Inference gateway](https://usagemax.com/workspace/gateway) and open **Hosted eval runs**. Verify the run before using its ID as the baseline for a subsequent run. Use the same run ID and report if you retry publication. Use a new ID when you execute a new live measurement or change the comparison. The runner defaults to `https://usagemax.com`. For local integration tests, `USAGEMAX_GATEWAY_EVAL_BASE_URL` may be an explicit loopback origin such as `http://127.0.0.1:3000`.

The local gate still checks quality, latency, token, and charge budgets. An optional hosted comparison checks whether previously passing cases in a compatible project run now fail. A requested publication failure, local gate failure, or hosted regression gives the CLI a nonzero exit status. Fixture observations and charges are simulated and incur no provider charges. Hosted reports hold per-case metrics and pass/fail results and follow workspace retention.
