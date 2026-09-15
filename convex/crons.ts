import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("trim expired telemetry", { hourUTC: 3, minuteUTC: 17 }, internal.telemetry.deleteExpired, {});
crons.daily("resume due account deletions", { hourUTC: 3, minuteUTC: 47 }, internal.account.processDueDeletionRequests, {});
crons.interval("evaluate monthly budgets", { minutes: 30 }, internal.budgets.evaluateAll, { cursor: null });
crons.interval("shared provider import queue", { minutes: 1 }, internal.connections.dispatch, {});
crons.interval("workspace telemetry retention", { hours: 24 }, internal.retention.sweep, {});
crons.interval("quiet coverage notifications", { hours: 24 }, internal.coverageAlerts.check, {});

export default crons;
