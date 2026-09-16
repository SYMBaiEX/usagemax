import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("trim expired telemetry", "17 3 * * *", internal.telemetry.deleteExpired, {});
crons.cron("resume due account deletions", "47 3 * * *", internal.account.processDueDeletionRequests, {});
crons.interval("evaluate monthly budgets", { minutes: 30 }, internal.budgets.evaluateAll, { cursor: null });
crons.interval("shared provider import queue", { seconds: 5 }, internal.connections.dispatch, {});
crons.interval("workspace telemetry retention", { hours: 24 }, internal.retention.sweep, {});
crons.interval("quiet coverage notifications", { hours: 24 }, internal.coverageAlerts.check, {});

export default crons;
