# Gateway smoke evaluations

The versioned synthetic dataset compares the same cases on two Sonnely routes for the same model. Its deterministic evaluator checks literal text and exact JSON values and structure. Reports include per-case pass results, input and output tokens, customer charge in USD millionths, and client-observed latency. Reports omit prompts and completion text.

Run the fixture gate locally with `bun scripts/gateway-eval.ts fixture`. It uses checked-in synthetic observations and the named fixture baseline. GitHub CI runs this command with no credentials or model calls. A missing or duplicate observation, a regression in a previously passing case, or a breached latency, token, or charge budget fails the gate.

To measure providers, supply `SONNELY_EVAL_API_KEY` through the environment and run `bun scripts/gateway-eval.ts sonnely`. This submits four requests with a reservation limit of $0.005 per request and uses the charge from the Sonnely receipt. A live run can take a distinct, reviewed baseline as its second argument. Set its mode to `sonnely` and use the observed run to select budgets for each route. A fixture baseline cannot gate live results.
