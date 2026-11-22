// Generated from the UsageMax OpenAPI gateway contract. Run bun run gateway:generate.
export interface paths {
    "/api/v1/gateway/receipts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read a bounded slice of private settlements for the report key's project. The inclusive UTC range can cover up to 31 days. */
        get: operations["listGatewayReceipts"];
        put?: never;
        /** @description Write settled requests to the project attached to the ingest key. Repeated revisions with identical data are idempotent. Later revisions can add evidence. */
        post: operations["writeGatewayReceipts"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/gateway/receipts/{requestId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Read a single settlement with the project's report key. */
        get: operations["getGatewayReceipt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/gateway/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Check connectivity and the scope of a project gateway key. */
        get: operations["getGatewayStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        GatewayReceipt: {
            /** @constant */
            schemaVersion: 1;
            requestId: string;
            revision: number;
            provider: string;
            model: string;
            resolvedModel?: string;
            traceId?: string;
            /** @enum {string} */
            status: "ok" | "error" | "cancelled";
            /** @description Unix epoch in milliseconds. */
            settledAt: number;
            /** @description Unix epoch in milliseconds. */
            startedAt?: number;
            /** @description Unix epoch in milliseconds. */
            firstTokenAt?: number;
            stream?: boolean;
            /** @constant */
            currency: "USD";
            /** @description USD nanodollars. A null value means this amount was unavailable. */
            customerChargeNanos: number | null;
            /** @description USD nanodollars. A null value means this amount was unavailable. */
            providerCostNanos: number | null;
            /** @enum {string} */
            providerCostBasis: "provider_reported" | "invoice_confirmed" | "estimated" | "unknown";
            usage: {
                inputTokens?: number;
                outputTokens?: number;
                cacheReadTokens?: number;
                cacheWriteTokens?: number;
                reasoningTokens?: number;
                reportedTotalTokens?: number;
                unclassifiedTokens?: number;
            };
        };
        GatewayStatus: {
            /** @constant */
            ok: true;
            /** @enum {string} */
            scope: "ingest" | "report";
            lastSuccessAt: number | null;
        };
        GatewayWriteResult: {
            results: {
                requestId: string;
                revision: number;
                /** @enum {string} */
                status: "accepted" | "replay" | "stale" | "conflict";
            }[];
        };
        GatewayReport: {
            receipts: components["schemas"]["GatewayReceipt"][];
            truncated: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listGatewayReceipts: {
        parameters: {
            query: {
                from: string;
                through: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Project receipts and coverage. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GatewayReport"];
                };
            };
            /** @description Invalid receipt, request ID, or report filters. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid, revoked, or inactive gateway key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The gateway key lacks the required scope. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Project key rate limit reached. Retry with backoff. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The UsageMax gateway service is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    writeGatewayReceipts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    receipts: components["schemas"]["GatewayReceipt"][];
                };
            };
        };
        responses: {
            /** @description Per-receipt results. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GatewayWriteResult"];
                };
            };
            /** @description Invalid receipt, request ID, or report filters. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid, revoked, or inactive gateway key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The gateway key lacks the required scope. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Body exceeds 64 KiB. */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Use application/json. */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Project key rate limit reached. Retry with backoff. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The UsageMax gateway service is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getGatewayReceipt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                requestId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The latest settled request revision. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        receipt: components["schemas"]["GatewayReceipt"];
                    };
                };
            };
            /** @description Invalid receipt, request ID, or report filters. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid, revoked, or inactive gateway key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The gateway key lacks the required scope. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The request was not found in this project. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Project key rate limit reached. Retry with backoff. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The UsageMax gateway service is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getGatewayStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Scope and latest successful ingestion or read, where available. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GatewayStatus"];
                };
            };
            /** @description Invalid receipt, request ID, or report filters. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid, revoked, or inactive gateway key. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The gateway key lacks the required scope. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Project key rate limit reached. Retry with backoff. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The UsageMax gateway service is unavailable. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
