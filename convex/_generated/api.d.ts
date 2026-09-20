/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as activity from "../activity.js";
import type * as billing from "../billing.js";
import type * as budgets from "../budgets.js";
import type * as collectorAccess from "../collectorAccess.js";
import type * as connections from "../connections.js";
import type * as coverageAlerts from "../coverageAlerts.js";
import type * as crons from "../crons.js";
import type * as device_name from "../device_name.js";
import type * as devices from "../devices.js";
import type * as finance from "../finance.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as organizationActions from "../organizationActions.js";
import type * as personal from "../personal.js";
import type * as productPolicy from "../productPolicy.js";
import type * as productSchema from "../productSchema.js";
import type * as providerActions from "../providerActions.js";
import type * as providerMath from "../providerMath.js";
import type * as public_ from "../public.js";
import type * as rateLimits from "../rateLimits.js";
import type * as retention from "../retention.js";
import type * as savings from "../savings.js";
import type * as snapshots from "../snapshots.js";
import type * as telemetry from "../telemetry.js";
import type * as tokenBuckets from "../tokenBuckets.js";
import type * as workos from "../workos.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  activity: typeof activity;
  billing: typeof billing;
  budgets: typeof budgets;
  collectorAccess: typeof collectorAccess;
  connections: typeof connections;
  coverageAlerts: typeof coverageAlerts;
  crons: typeof crons;
  device_name: typeof device_name;
  devices: typeof devices;
  finance: typeof finance;
  http: typeof http;
  imports: typeof imports;
  lib: typeof lib;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  organizationActions: typeof organizationActions;
  personal: typeof personal;
  productPolicy: typeof productPolicy;
  productSchema: typeof productSchema;
  providerActions: typeof providerActions;
  providerMath: typeof providerMath;
  public: typeof public_;
  rateLimits: typeof rateLimits;
  retention: typeof retention;
  savings: typeof savings;
  snapshots: typeof snapshots;
  telemetry: typeof telemetry;
  tokenBuckets: typeof tokenBuckets;
  workos: typeof workos;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
