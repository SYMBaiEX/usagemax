import { reportDateArgs } from "./core.js";

/** Build the stable, model-complete ccusage command used by sync and doctor. */
export function ccusageDailyArgs(config, options = {}) {
  return [
    "daily",
    "--json",
    "--offline",
    "--mode",
    "calculate",
    "--timezone",
    "UTC",
    "--by-agent",
    "--breakdown",
    "--order",
    "asc",
    "--sections",
    "daily,session",
    ...reportDateArgs(config, options),
  ];
}
