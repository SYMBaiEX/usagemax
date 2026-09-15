import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("trim expired telemetry", { hourUTC: 3, minuteUTC: 17 }, internal.telemetry.deleteExpired, {});
crons.daily("resume due account deletions", { hourUTC: 3, minuteUTC: 47 }, internal.account.processDueDeletionRequests, {});

export default crons;
