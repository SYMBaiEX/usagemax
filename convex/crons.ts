import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("trim expired telemetry", { hourUTC: 3, minuteUTC: 17 }, internal.telemetry.deleteExpired, {});

export default crons;
