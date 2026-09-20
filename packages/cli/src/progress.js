const FRAMES = ["·", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function canAnimate({ json = false, quiet = false, noProgress = false } = {}) {
  return Boolean(process.stderr.isTTY)
    && !json
    && !quiet
    && !noProgress
    && process.env.USAGEMAX_NO_PROGRESS !== "1"
    && process.env.CI !== "true";
}

/**
 * A tiny stderr-only progress reporter. JSON and scheduled runs stay silent so
 * stdout remains machine-readable and background jobs do not write a stream.
 */
export function createProgress(options = {}) {
  const enabled = canAnimate(options);
  let timer;
  let frame = 0;
  let active = false;
  let last = "";
  let startedAt = 0;

  const elapsed = () => {
    const seconds = Math.max(0, (Date.now() - startedAt) / 1000);
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  };

  const render = (text) => {
    if (!enabled || !active) return;
    const line = `${FRAMES[frame % FRAMES.length]} ${text} · ${elapsed()}`;
    frame += 1;
    last = line;
    process.stderr.write(`\r\x1b[2K${line}`);
  };

  return {
    enabled,
    start(text) {
      if (!enabled) return;
      active = true;
      startedAt = Date.now();
      render(text);
      timer = setInterval(() => render(last.replace(/^[^ ]+ /, "").replace(/ · \d+(?:\.\d+)?s$/, "")), 120);
      timer.unref?.();
    },
    update(text) {
      if (!enabled) return;
      if (!active) this.start(text);
      else render(text);
    },
    succeed(text) {
      if (!enabled) return;
      const duration = elapsed();
      this.stop();
      process.stderr.write(`\r\x1b[2K✓ ${text} (${duration})\n`);
    },
    fail(text) {
      if (!enabled) return;
      const duration = elapsed();
      this.stop();
      process.stderr.write(`\r\x1b[2K✗ ${text} (${duration})\n`);
    },
    stop() {
      if (!enabled) return;
      if (timer) clearInterval(timer);
      timer = undefined;
      if (active) process.stderr.write("\r\x1b[2K");
      active = false;
      startedAt = 0;
    },
  };
}
