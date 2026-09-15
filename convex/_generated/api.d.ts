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
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib from "../lib.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as public_ from "../public.js";
import type * as rateLimits from "../rateLimits.js";
import type * as snapshots from "../snapshots.js";
import type * as telemetry from "../telemetry.js";
import type * as workos from "../workos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  crons: typeof crons;
  http: typeof http;
  imports: typeof imports;
  lib: typeof lib;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  public: typeof public_;
  rateLimits: typeof rateLimits;
  snapshots: typeof snapshots;
  telemetry: typeof telemetry;
  workos: typeof workos;
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
