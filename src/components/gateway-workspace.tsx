"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CopyButton } from "./copy-button";
import styles from "./workspace.module.css";
import gateway from "./gateway-workspace.module.css";

type GatewayProps = { projectHint: string | null; receiptHint: string | null; today: string };
type Overview = FunctionReturnType<typeof api.workspaces.overview>;
type Receipt = FunctionReturnType<typeof api.gatewayReceipts.list>["receipts"][number];
type Credential = FunctionReturnType<typeof api.gatewayCredentials.list>["credentials"][number];
type KeyScope = Credential["scope"];

const dayMs = 86_400_000;
const nanosPerDollar = BigInt(1_000_000_000);
const integer = new Intl.NumberFormat("en-US");
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const states = { ok: "Succeeded", error: "Failed", cancelled: "Cancelled" };
const costBases = {
  provider_reported: "Provider reported",
  invoice_confirmed: "Invoice confirmed",
  estimated: "Estimated",
  unknown: "Unknown",
};
const counterLabels = {
  inputTokens: "Input",
  outputTokens: "Output",
  cacheReadTokens: "Cache read",
  cacheWriteTokens: "Cache write",
  reasoningTokens: "Reasoning",
  reportedTotalTokens: "Reported total",
  unclassifiedTokens: "Unclassified",
} satisfies Record<keyof Receipt["usage"], string>;

function utc(value: number | null | undefined) {
  return value == null ? "Unavailable" : `${dateTime.format(value)} UTC`;
}

function usdNanos(value: number | null) {
  if (value === null) return "Unavailable";
  const nanos = BigInt(value);
  const dollars = nanos / nanosPerDollar;
  const remainder = (nanos % nanosPerDollar).toString().padStart(9, "0");
  const decimal = remainder.replace(/0+$/, "").padEnd(2, "0");
  return `$${integer.format(dollars)}.${decimal}`;
}

function scopeLabel(scope: KeyScope) {
  return scope === "ingest" ? "Ingest · write only" : "Reporting · read only";
}

function isRequestId(value: string) {
  return /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/.test(value);
}

export function GatewayWorkspace(props: GatewayProps) {
  return (
    <div className={`shell ${styles.workspace}`}>
      <header className={styles.header}>
        <h1>Inference gateway</h1>
        <Link className="button button-outline" href="/workspace">Back to workspace</Link>
      </header>
      <AuthLoading><p role="status">Opening your workspace…</p></AuthLoading>
      <Unauthenticated>
        <Link className="button button-primary" href="/sign-in?returnTo=%2Fworkspace%2Fgateway">Sign in</Link>
      </Unauthenticated>
      <Authenticated><GatewayAccess {...props} /></Authenticated>
    </div>
  );
}

function GatewayAccess(props: GatewayProps) {
  const account = useQuery(api.account.current, {});
  const overview = useQuery(api.workspaces.overview, account?.profile ? {} : "skip");

  if (account === undefined || (account?.profile && !overview)) {
    return <p role="status">Checking workspace access…</p>;
  }
  if (!account?.profile || !overview) {
    return (
      <section className={styles.panel}>
        <h2>Set up your workspace</h2>
        <p className={styles.hint}>Create a workspace profile before connecting a gateway.</p>
        <Link className="button button-primary" href="/account">Set up your account</Link>
      </section>
    );
  }
  if (!overview.capabilities["finance:read"] && !overview.capabilities["collectors:manage"]) {
    return (
      <section className={styles.panel}>
        <h2>Gateway access required</h2>
        <p className={styles.hint}>Contact your workspace administrator for reporting or key management access.</p>
      </section>
    );
  }
  return <GatewayProjects key={overview.workspace.id} overview={overview} {...props} />;
}

function GatewayProjects({ overview, projectHint, receiptHint, today }: GatewayProps & { overview: Overview }) {
  const projects = usePaginatedQuery(api.gatewayCredentials.projects, {}, { initialNumItems: 50 });
  const [selection, selectProject] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const active = projects.results.filter((project) => project.archivedAt === undefined);
  const lookupProject = projectHint !== null && !active.some((project) => project._id === projectHint);
  const linkedProject = useQuery(api.gatewayCredentials.project, lookupProject ? { projectId: projectHint } : "skip");
  const options = linkedProject ? [linkedProject, ...active] : active;
  const desired = selection ?? projectHint;
  const project = desired ? options.find((item) => item._id === desired) : options[0];
  const loading = !project && (projects.status === "LoadingFirstPage" || (lookupProject && linkedProject === undefined));

  return (
    <div className={styles.body}>
      <section className={styles.panel} aria-label="Gateway project">
        <h2>{overview.workspace.name}</h2>
        {loading ? (
          <p role="status" className={styles.hint}>Loading projects…</p>
        ) : (
          <>
            {options.length > 0 && (
              <div className={styles.form}>
                <label>
                  Project
                  <select value={project?._id ?? ""} onChange={(event) => selectProject(event.target.value)} disabled={pending}>
                    <option value="" disabled>Select a project</option>
                    {options.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </label>
              </div>
            )}
            {projectHint && !selection && !project && (
              <p className={styles.hint} role="status">
                The linked project is unavailable in this workspace. Choose a project or switch workspaces.
              </p>
            )}
            {!options.length && projects.status === "Exhausted" && (
              <p className={styles.hint}>Create an active project in the workspace to start collecting receipts.</p>
            )}
            {(projects.status === "CanLoadMore" || projects.status === "LoadingMore") && (
              <button className={`button button-outline ${gateway.more}`} type="button" onClick={() => projects.loadMore(50)} disabled={projects.status === "LoadingMore"}>
                {projects.status === "LoadingMore" ? "Loading projects…" : "Load more projects"}
              </button>
            )}
          </>
        )}
      </section>
      {project && overview.capabilities["finance:read"] && (
        <GatewayReceipts
          key={`${project._id}:${receiptHint ?? ""}`}
          projectId={project._id}
          receiptHint={!projectHint || projectHint === project._id ? receiptHint : null}
          today={today}
        />
      )}
      {project && receiptHint && !overview.capabilities["finance:read"] && (
        <section className={styles.panel}>
          <h2>Reporting access required</h2>
          <p className={styles.hint}>Contact your workspace administrator to view this receipt.</p>
        </section>
      )}
      {project && overview.capabilities["collectors:manage"] && (
        <GatewayCredentials
          key={`${project._id}:${overview.capabilities["finance:read"]}`}
          projectId={project._id}
          canReport={overview.capabilities["finance:read"]}
          setProjectPending={setPending}
        />
      )}
    </div>
  );
}

function GatewayOperations({ projectId, from, through }: { projectId: Id<"projects">; from: string; through: string }) {
  const report = useQuery(api.gatewayOperations.workspaceReport, { projectId, from, through });
  if (!report) return <p className={styles.hint} role="status">Loading gateway analytics…</p>;
  return <section className={styles.item} aria-label="Gateway analytics">
    <h3>Gateway analytics</h3>
    <p className={styles.hint}>{from} through {through} UTC · latest {report.limit.toLocaleString()} retained receipts at most.</p>
    <dl className={gateway.facts}>
      <div><dt>Requests</dt><dd>{integer.format(report.overall.requests)}</dd></div>
      <div><dt>Provider attempts</dt><dd>{integer.format(report.overall.providerAttempts)}</dd></div>
      <div><dt>P95 latency</dt><dd>{report.overall.latency ? `${integer.format(report.overall.latency.p95)} ms` : "Unavailable"}</dd></div>
      <div><dt>Invoice-confirmed costs</dt><dd>{integer.format(report.overall.invoiceConfirmed)}</dd></div>
    </dl>
    {report.truncated && <p className={styles.hint}>This report reached its receipt limit.</p>}
    <p className={styles.hint}>{report.alerts.evaluatedAt === null
      ? "Alert evaluation pending."
      : `${report.alerts.items.filter((alert) => alert.resolvedAt === undefined).length} open alerts · evaluated ${utc(report.alerts.evaluatedAt)}.`}</p>
  </section>;
}

function GatewayReceipts({ projectId, receiptHint, today }: { projectId: Id<"projects">; receiptHint: string | null; today: string }) {
  const from = new Date(Date.parse(today) - 6 * dayMs).toISOString().slice(0, 10);
  const page = useQuery(api.gatewayReceipts.list, { projectId, from, through: today, limit: 50 });
  const [requested, selectReceipt] = useState(receiptHint);
  const [search, setSearch] = useState(receiptHint ?? "");
  const detail = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  const receipt = useQuery(api.gatewayReceipts.get, requested ? { projectId, requestId: requested } : "skip");

  useEffect(() => {
    if (focusNext.current && receipt !== undefined) {
      detail.current?.focus();
      focusNext.current = false;
    }
  }, [receipt, requested]);

  function openReceipt(requestId: string) {
    if (requested === requestId) {
      detail.current?.focus();
      return;
    }
    focusNext.current = true;
    selectReceipt(requestId);
  }

  function findReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = search.trim();
    if (isRequestId(requestId)) openReceipt(requestId);
  }

  return (
    <section className={styles.panel} aria-labelledby="gateway-receipts">
      <h2 id="gateway-receipts">Request receipts</h2>
      <GatewayOperations projectId={projectId} from={from} through={today} />
      <form className={styles.form} onSubmit={findReceipt}>
        <label>
          Request ID
          <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} placeholder="Opaque request ID" />
        </label>
        <button className="button button-outline" type="submit" disabled={!isRequestId(search.trim())}>Find receipt</button>
      </form>
      {requested && (
        <div id="selected-gateway-receipt" ref={detail} className={gateway.detail} role="region" aria-label="Selected receipt" tabIndex={-1}>
          {receipt === undefined ? <p role="status">Loading receipt…</p> : receipt ? <ReceiptDetail receipt={receipt} projectId={projectId} /> : (
            <div className={styles.empty}><p>This receipt is unavailable in the selected project.</p></div>
          )}
        </div>
      )}
      <p className={styles.hint}>Recent settlements from {from} through {today} UTC.</p>
      {page === undefined ? (
        <p className={styles.hint} role="status">Loading settlements…</p>
      ) : page.receipts.length === 0 ? (
        <div className={styles.empty}><p>No receipts for this project in the last seven days.</p></div>
      ) : (
        <>
          {page.truncated && <p className={styles.hint}>Showing the latest 50 receipts. Find an older receipt by request ID.</p>}
          <div className={`${styles.scroll} ${gateway.receiptsList}`} role="region" aria-label="Recent gateway receipts" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Settled</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {page.receipts.map((row) => (
                  <tr key={row.requestId}>
                    <td>
                      <button type="button" onClick={() => { setSearch(row.requestId); openReceipt(row.requestId); }} aria-pressed={requested === row.requestId} aria-label={`View receipt ${row.requestId}`}>
                        {row.requestId}
                      </button>
                      <small>{row.resolvedModel ?? row.model}</small>
                    </td>
                    <td>{row.provider}</td>
                    <td>{utc(row.settledAt)}</td>
                    <td>{states[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ReceiptDetail({ receipt, projectId }: { receipt: Receipt; projectId: Id<"projects"> }) {
  const query = new URLSearchParams({ projectId, requestId: receipt.requestId });
  return (
    <article className={styles.item}>
      <header className={gateway.detailHeader}>
        <div>
          <h3>{receipt.resolvedModel ?? receipt.model}</h3>
          <p className={styles.hint}>{receipt.provider} · {states[receipt.status]} · Revision {receipt.revision}</p>
        </div>
        <Link className="button button-outline" href={`/workspace/gateway?${query}#gateway-receipts`}>Open receipt link</Link>
      </header>
      <dl className={gateway.facts}>
        <div><dt>Request ID</dt><dd><code>{receipt.requestId}</code></dd></div>
        <div><dt>Trace ID</dt><dd>{receipt.traceId ? <code>{receipt.traceId}</code> : "Unavailable"}</dd></div>
        <div><dt>Requested model</dt><dd>{receipt.model}</dd></div>
        <div><dt>Resolved model</dt><dd>{receipt.resolvedModel ?? "Unavailable"}</dd></div>
        <div><dt>Started</dt><dd>{utc(receipt.startedAt)}</dd></div>
        <div><dt>First token</dt><dd>{utc(receipt.firstTokenAt)}</dd></div>
        <div><dt>Settled</dt><dd>{utc(receipt.settledAt)}</dd></div>
        <div><dt>Streaming</dt><dd>{receipt.stream === undefined ? "Unavailable" : receipt.stream ? "Yes" : "No"}</dd></div>
      </dl>
      {receipt.trace && <>
        <h4>Request spans</h4>
        <p className={styles.hint}>{receipt.trace.billingStatus === "pending" ? "Billing pending" : "Billing final"}</p>
        <ol>
          {receipt.trace.spans.map((span) => (
            <li key={span.spanId}>
              {span.kind} · {span.endedAt - span.startedAt} ms · {span.status}
              {span.provider && ` · ${span.provider}`}{span.httpStatus && ` · HTTP ${span.httpStatus}`}
              {span.outcome && ` · ${span.outcome.replaceAll("_", " ")}`}
            </li>
          ))}
        </ol>
      </>}
      <h4>Accounting</h4>
      <dl className={gateway.facts}>
        <div><dt>Customer charge (USD)</dt><dd>{usdNanos(receipt.customerChargeNanos)}</dd></div>
        <div><dt>Provider cost (USD)</dt><dd>{usdNanos(receipt.providerCostNanos)}</dd></div>
        <div><dt>Provider cost evidence</dt><dd>{costBases[receipt.providerCostBasis]}</dd></div>
      </dl>
      <h4>Tokens</h4>
      <dl className={gateway.facts}>
        {(Object.keys(counterLabels) as Array<keyof Receipt["usage"]>).map((counter) => (
          <div key={counter}>
            <dt>{counterLabels[counter]}</dt>
            <dd>{receipt.usage[counter] === undefined ? "Unreported" : integer.format(receipt.usage[counter])}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function GatewayCredentials({ projectId, canReport, setProjectPending }: {
  projectId: Id<"projects">;
  canReport: boolean;
  setProjectPending: (pending: boolean) => void;
}) {
  const page = useQuery(api.gatewayCredentials.list, { projectId });
  const issue = useAction(api.gatewayCredentials.issue);
  const rotate = useAction(api.gatewayCredentials.rotate);
  const revoke = useMutation(api.gatewayCredentials.revoke);
  const [copyKey, setCopyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function run(task: () => Promise<{ token?: string }>, success: string) {
    if (busy) return;
    setBusy(true);
    setProjectPending(true);
    setCopyKey(null);
    setError("");
    setStatus("");
    try {
      const result = await task();
      setCopyKey(result.token ?? null);
      setStatus(success);
    } catch {
      setError("The gateway key could not be updated. Check your access or try again.");
    } finally {
      setBusy(false);
      setProjectPending(false);
    }
  }

  function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const scope = data.get("scope") === "report" ? "report" : "ingest";
    if (!name || (scope === "report" && !canReport)) return;
    void run(async () => {
      const result = await issue({ projectId, name, scope });
      form.reset();
      return result;
    }, "Gateway key created.");
  }

  function manageKey(key: Credential, operation: "rotate" | "revoke") {
    if (busy || key.revokedAt !== null || (key.scope === "report" && !canReport)) return;
    const question = operation === "rotate"
      ? `Rotate “${key.name}”? The current key stops working immediately. Save the replacement when it appears.`
      : `Revoke “${key.name}”? Its current key stops working immediately.`;
    if (!window.confirm(question)) return;
    if (operation === "rotate") void run(() => rotate({ credentialId: key._id }), "Gateway key rotated.");
    else void run(async () => { await revoke({ credentialId: key._id }); return {}; }, "Gateway key revoked.");
  }

  return (
    <section className={styles.panel} aria-labelledby="gateway-keys" aria-busy={busy}>
      <h2 id="gateway-keys">Gateway keys</h2>
      <form className={styles.form} onSubmit={createKey}>
        <label>Key name<input name="name" required maxLength={80} placeholder="Production gateway" disabled={busy} /></label>
        <label>
          Scope
          <select name="scope" defaultValue="ingest" disabled={busy}>
            <option value="ingest">{scopeLabel("ingest")}</option>
            {canReport && <option value="report">{scopeLabel("report")}</option>}
          </select>
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>Create key</button>
      </form>
      {error && <p className={styles.notice} data-error="true" role="alert">{error}</p>}
      {status && <p className={styles.hint} role="status">{status}</p>}
      {copyKey && (
        <div className={`${styles.item} ${gateway.detail}`}>
          <h3>Copy your gateway key</h3>
          <p id="new-gateway-key-hint" className={styles.hint}>Save it in your gateway’s secret manager. It is shown once.</p>
          <div className={styles.toolbar}>
            <CopyButton value={copyKey} />
            <button className="button button-outline" type="button" onClick={() => setCopyKey(null)}>Dismiss key</button>
          </div>
          <input
            className={gateway.secret}
            type="text"
            aria-label="New gateway key"
            aria-describedby="new-gateway-key-hint"
            value={copyKey}
            readOnly
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      {page === undefined ? (
        <p role="status" className={styles.hint}>Loading gateway keys…</p>
      ) : page.credentials.length === 0 ? (
        <div className={styles.empty}><p>No keys available for this project.</p></div>
      ) : (
        <>
          {page.truncated && <p className={styles.hint}>Key history is truncated.</p>}
          <div className={styles.scroll} role="region" aria-label="Project gateway keys" tabIndex={0}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Name</th><th scope="col">Scope</th><th scope="col">Last success</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {page.credentials.map((key) => (
                  <tr key={key._id}>
                    <td>{key.name}<small>{key.keyPrefix}… · {key.revokedAt === null ? "Active" : "Revoked"}</small></td>
                    <td>{scopeLabel(key.scope)}</td>
                    <td>{key.lastSuccessAt === null ? "Never" : utc(key.lastSuccessAt)}</td>
                    <td>
                      {key.revokedAt === null && (key.scope === "ingest" || canReport) && (
                        <>
                          <button type="button" disabled={busy} onClick={() => manageKey(key, "rotate")} aria-label={`Rotate ${key.name}`}>Rotate</button>
                          <button type="button" disabled={busy} onClick={() => manageKey(key, "revoke")} aria-label={`Revoke ${key.name}`}>Revoke</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
