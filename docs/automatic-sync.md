# Lightweight automatic sync

## Reference review

Reviewed the public [TokenMaxxing service implementation](https://github.com/851-labs/tokenmaxxing/blob/main/apps/cli/src/commands/service.ts) and [CLI usage](https://github.com/851-labs/tokenmaxxing#usage).
It uses native launchd/systemd/Windows scheduling at five-minute intervals,
one-minute jitter, locks, rotated logs, service health state, and managed runner
updates. UsageMax adopts the native scheduling pattern, with its own implementation.

## UsageMax decisions

- Explicit opt-in; linking still performs just one sync.
- Default approximately 15 minutes, configurable from 5 minutes to 24 hours.
- No resident daemon, filesystem watchers, updater, or repeated package-manager invocation.
- Persistent global installation required; ephemeral bunx/npx cache paths rejected.
- macOS launchd background process with lower CPU/I/O priority and a small stable
  interval offset; Linux user systemd one-shot timer with randomized delay;
  Windows least-privilege interactive task with IgnoreNew and randomized delay.
- Run while the user's OS/session is available. Never enable system linger, wake
  sleeping machines, or keep WSL alive. Windows starts defer on battery.
- Existing incremental inventory checks, server idempotency, and config lock
  remain the accounting and overlap controls. No new upload protocol or heartbeat.
- Parser subprocess has a ten-minute timeout; failure releases the collector lock
  and does not commit an unfinished checkpoint. Network requests retain their
  existing bounded retry/timeout policy. There is no whole-job deadline: large
  legitimate uploads can finish, and a stalled job cannot spawn overlapping jobs.
- Failed jobs back off up to six hours. Store only one atomic, small status record;
  discard scheduled stdout/stderr rather than growing unbounded logs. Diagnose
  failures with a manual sync. A forcibly terminated process may require explicit
  stale-lock cleanup after verifying its PID is no longer running.
- Allowlist captured source-path environment; never copy the complete environment
  or put collector credentials in scheduler command lines.
- No automatic package upgrade: users upgrade deliberately and reinstall the
  scheduler to refresh runtime paths and source configuration.

## Validation scope

Tests cover interval bounds, escaping, ephemeral-runtime rejection, environment
allowlisting, all three scheduler renderings, install/update/removal with a mocked
native scheduler, disabled/backoff/busy/success/error runs, checkpoint preservation,
and packaged-module availability. macOS additionally checks plist validity using
the native parser. An isolated launchd job was also registered, started, observed
exiting successfully without a linked collector, and removed. Rendering tests
are not live Windows/Linux scheduler tests.

The no-change path still inventories file metadata. It is low-frequency, not
zero-cost; first/full reconciliation and active usage can be materially heavier.
Production CPU/RSS and disk-I/O measurements across large histories remain a
separate performance qualification, not a claim inferred from unit tests.
