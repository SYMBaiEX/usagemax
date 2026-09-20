"use client";

/* Export links intentionally use full-document downloads, not the Next router. */
/* eslint-disable @next/next/no-html-link-for-pages */

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { AuthNavigation } from "./auth-navigation";
import styles from "./workspace.module.css";

type Overview = FunctionReturnType<typeof api.workspaces.overview>;
type Role = "admin" | "finance" | "manager" | "member" | "auditor" | "viewer";
type Runner = (
  operation: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>;
const Operations = createContext<{ run: Runner; busy: boolean }>({
  run: async () => false,
  busy: false,
});
const Timezone = createContext("UTC");
const numeric = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
});
function money(value: number | undefined | null, currency = "USD") {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value / 1e6);
}
function micros(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^-?\d+(\.\d{1,6})?$/.test(text))
    throw new Error("Enter an amount with up to six decimal places.");
  const amount = Math.round(Number(text) * 1e6);
  if (!Number.isSafeInteger(amount)) throw new Error("Amount is too large.");
  return amount;
}
function useDateTime() {
  const timezone = useContext(Timezone);
  return (value?: number) =>
    value
      ? new Intl.DateTimeFormat("en", {
          timeZone: timezone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(value)
      : "Not yet synced";
}
function text(data: FormData, key: string) {
  return String(data.get(key) ?? "");
}
function readableError(error: unknown) {
  const value = String(error);
  const known: Record<string, string> = {
    FORBIDDEN: "Your role does not allow this action.",
    SESSION_REFRESH_REQUIRED:
      "Your access changed. Sign out and back in to refresh it.",
    ENTERPRISE_REQUIRED:
      "This workspace needs an enterprise agreement for this feature.",
    PROVIDER_VAULT_NOT_CONFIGURED:
      "Provider connections are awaiting secure vault configuration by the UsageMax operator.",
    ORGANIZATION_SERVICE_NOT_CONFIGURED:
      "Organization administration is awaiting WorkOS configuration.",
    INVITATION_ALREADY_PENDING:
      "An invitation is already pending for this address.",
    FREE_WORKSPACE_MEMBER_LIMIT:
      "Free workspaces support 10 members, including pending invitations.",
    TRANSFER_OWNERSHIP_FIRST:
      "The workspace owner cannot be removed. Contact support for an ownership transfer.",
    MEASUREMENT_AND_BASELINE_REQUIRED:
      "Move the action to measuring and record a baseline, result evidence and observed savings first.",
    MANAGED_BY_IDENTITY_PROVIDER:
      "Manage this member in your identity provider.",
    INVITATION_SEND_FAILED:
      "The invitation result is uncertain. Check WorkOS before sending another invitation.",
    OWNER_REQUIRED: "Only the workspace owner can manage administrators.",
    SAVED_VIEW_LIMIT: "Remove a saved view before adding another (30 maximum).",
  };
  for (const [key, message] of Object.entries(known))
    if (value.includes(key)) return message;
  return "That change could not be saved. Check the fields and try again.";
}
function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { busy } = useContext(Operations);
  return (
    <button
      className="button button-primary"
      {...props}
      aria-busy={busy || undefined}
      disabled={busy || props.disabled}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? styles.wide : undefined}>
      {label}
      {children}
    </label>
  );
}
function Form({
  children,
  submit,
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<unknown>;
}) {
  const { run } = useContext(Operations);
  return (
    <form
      className={styles.form}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        void run(() => submit(data)).then((ok) => {
          if (ok) form.reset();
        });
      }}
    >
      {children}
    </form>
  );
}
function Panel({
  title,
  children,
  action,
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeader}>
        <div className={styles.panelTitle}>
          {eyebrow && <span className={styles.panelEyebrow}>{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.loadingState} role="status">
      <span className={styles.loadingStateMark} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      <span className={styles.emptyMark} aria-hidden="true">
        —
      </span>
      <p>{children}</p>
    </div>
  );
}
function More({ status, load }: { status: string; load: (n: number) => void }) {
  return status === "CanLoadMore" ? (
    <button className="button button-outline" onClick={() => load(40)}>
      Load more
    </button>
  ) : status === "LoadingMore" ? (
    <p className={styles.loadingNote} role="status">
      <span aria-hidden="true" />
      Loading more…
    </p>
  ) : null;
}
function Table({
  headings,
  children,
}: {
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div
      className={styles.scroll}
      tabIndex={0}
      role="region"
      aria-label="Scrollable data table"
    >
      <table className={styles.table}>
        <thead>
          <tr>
            {headings.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function WorkspaceView() {
  return (
    <div className={`shell ${styles.workspace}`}>
      <AuthLoading>
        <LoadingState label="Opening your workspace…" />
      </AuthLoading>
      <Unauthenticated>
        <AuthNavigation href="/sign-in" className="button button-primary">
          Sign in
        </AuthNavigation>
      </Unauthenticated>
      <Authenticated>
        <WorkspaceGate />
      </Authenticated>
    </div>
  );
}
function WorkspaceGate() {
  const account = useQuery(api.account.current, {});
  const bootstrap = useMutation(api.workspaces.bootstrap);
  const [error, setError] = useState("");
  useEffect(() => {
    void bootstrap({}).catch((e) => setError(readableError(e)));
  }, [bootstrap]);
  if (error)
    return (
      <div role="alert">
        {error} <Link href="/account">Account settings</Link>
      </div>
    );
  if (!account)
    return (
      <div className={styles.loadingShell} role="status">
        <span />
        <span />
        <span />
      </div>
    );
  if (!account.profile)
    return (
      <Panel title="Your private workspace">
        <p className={styles.hint}>
          Choose a profile handle to start. Your history and devices remain
          free.
        </p>
        <Link className="button button-primary" href="/account">
          Set up your account
        </Link>
      </Panel>
    );
  return <Workspace />;
}
export function Workspace() {
  const preferences = useQuery(api.personal.preferences, {});
  const overview = useQuery(api.workspaces.overview, {});
  const workspaces = useQuery(api.workspaces.list, {});
  const create = useAction(api.organizationActions.create);
  const selectPersonal = useMutation(api.workspaces.selectPersonal);
  const { switchToOrganization } = useAuth();
  const [tab, setTab] = useState("Usage");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [requestId, setRequestId] = useState("");
  const run: Runner = async (operation, success = "Saved.") => {
    if (busy) return false;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await operation();
      setMessage(success);
      return true;
    } catch (e) {
      setError(true);
      setMessage(readableError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!overview)
    return (
      <div className={styles.loadingShell} role="status">
        <span />
        <span />
        <span />
      </div>
    );
  const cap = overview.capabilities;
  const tierLabel = overview.policy.enterprise
    ? "Enterprise"
    : overview.billing?.status === "active" || overview.billing?.status === "trialing"
      ? "Team operations"
      : "Free workspace";
  const initials = overview.workspace.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  const tabs = [
    cap["finance:read"] && "Usage",
    cap["finance:read"] && "Activity",
    "Teams",
    cap["finance:read"] && "Ledger",
    cap["finance:read"] && "Budgets",
    cap["finance:read"] && "Savings",
    overview.policy.enterprise && cap["integrations:manage"] && "Connections",
    cap["billing:read"] && "Billing",
    "Settings",
  ].filter(Boolean) as string[];
  const selected = tabs.includes(tab) ? tab : tabs[0];
  const tabCopy: Record<string, string> = {
    Usage: "Your complete usage record, with filters that stay private to this workspace.",
    Activity: "Content-free agent and outcome signals from the last 30 days.",
    Teams: "Organize people, projects, and cost centers without moving prompts or source code.",
    Ledger: "Reconcile provider reports, invoices, credits, and adjustments in one place.",
    Budgets: "Set guardrails and receive threshold alerts before a month runs away.",
    Savings: "Turn optimization ideas into measured, evidence-backed outcomes.",
    Connections: "Connect read-only provider sources with credentials kept server-side.",
    Billing: "Manage workspace capacity and payment details through Stripe-hosted billing.",
    Settings: "Control workspace identity, retention, notifications, and exports.",
  };
  return (
    <Timezone.Provider value={preferences?.timezone ?? "UTC"}>
      <Operations.Provider value={{ run, busy }}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <div className={styles.headerKicker}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>Workspace</span>
              <span className={styles.headerSlash}>/</span>
              <span>{tierLabel}</span>
            </div>
            <div className={styles.titleLine}>
              <span className={styles.workspaceAvatar} aria-hidden="true">{initials}</span>
              <div>
                <h1>{overview.workspace.name}</h1>
                <p>
                  {overview.workspace.organizationId
                    ? "Private team operations, shared reporting, and governed access."
                    : "Your usage, your history, and a privacy-first record of the work."}
                </p>
              </div>
            </div>
            <div className={styles.headerMeta}>
              <span><i aria-hidden="true" /> Secure session</span>
              <span>UTC accounting</span>
              <span>{overview.workspace.retentionDays}d detailed retention</span>
            </div>
          </div>
          <div className={`${styles.toolbar} ${styles.headerActions}`}>
            {(workspaces?.filter((w) => w.organizationId).length ?? 0) > 0 && (
              <label>
                <span className="sr-only">Switch workspace</span>
                <select
                  aria-label="Switch workspace"
                  value={overview.workspace.organizationId ?? "personal"}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (id)
                      void run(async () => {
                        await selectPersonal({ personal: id === "personal" });
                        if (id !== "personal")
                          await switchToOrganization(id, {
                            returnTo: "/workspace",
                          });
                      }, "Workspace switched.");
                  }}
                >
                  <option value="personal">Personal workspace</option>
                  {workspaces
                    ?.filter((w) => w.organizationId)
                    .map((w) => (
                      <option key={w.id} value={w.organizationId!}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <Link className="button button-outline" href="/account">
              Profile & devices
            </Link>
            {cap["workspace:manage"] && (
              <button
                className="button button-outline"
                onClick={() => {
                  setCreating(!creating);
                  if (!requestId) setRequestId(crypto.randomUUID());
                }}
              >
                {creating ? "Close" : "New workspace"}
              </button>
            )}
          </div>
        </header>
        {creating && (
          <Panel title="Create a company workspace">
            <p className={styles.hint}>
              Start free with up to 10 members. Personal history is not copied
              into a company.
            </p>
            <Form
              submit={async (data) => {
                const result = await create({
                  name: text(data, "name"),
                  requestId,
                });
                await selectPersonal({ personal: false });
                await switchToOrganization(result.organizationId, {
                  returnTo: "/workspace",
                });
              }}
            >
              <Field label="Company name">
                <input name="name" required maxLength={80} />
              </Field>
              <Button>Create workspace</Button>
            </Form>
          </Panel>
        )}
        <div className={styles.navigationBlock}>
          <div className={styles.navigationLabel}>
            <span>Workspace view</span>
          </div>
          <nav className={styles.tabs} aria-label="Workspace sections">
            {tabs.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setTab(item);
                  setMessage("");
                }}
                aria-current={selected === item ? "page" : undefined}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className={styles.viewSummary}>
            <div>
              <span className={styles.viewEyebrow}>{selected} / overview</span>
              <p>{tabCopy[selected]}</p>
            </div>
            <span className={styles.viewHint}>Private to this workspace</span>
          </div>
        </div>
        {message && (
          <p
            className={styles.notice}
            data-error={error}
            role={error ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        <div
          className={styles.body}
          key={`${overview.workspace.id}:${selected}`}
        >
          {selected === "Usage" && <Usage />}
          {selected === "Activity" && <Activity />}
          {selected === "Teams" && <Teams overview={overview} />}
          {selected === "Ledger" && <Ledger overview={overview} />}
          {selected === "Budgets" && (
            <Budgets editable={cap["finance:manage"]} />
          )}
          {selected === "Savings" && (
            <Savings editable={cap["finance:manage"]} />
          )}
          {selected === "Connections" && <Connections />}
          {selected === "Billing" && <Billing overview={overview} />}
          {selected === "Settings" && <Settings overview={overview} />}
        </div>
      </Operations.Provider>
    </Timezone.Provider>
  );
}

function Billing({ overview }: { overview: Overview }) {
  const billing = overview.billing;
  const active = billing?.status === "active" || billing?.status === "trialing";
  const period = billing?.currentPeriodEnd
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(billing.currentPeriodEnd)
    : null;
  return (
    <Panel title="Plan & billing" eyebrow="ACCOUNT">
      <div className={styles.stats}>
        <div>
          <span>Workspace plan</span>
          <strong>{active ? "Team" : "Free"}</strong>
        </div>
        <div>
          <span>Billing status</span>
          <strong>{billing?.status ?? "Not started"}</strong>
        </div>
        <div>
          <span>Renewal</span>
          <strong>{period ?? "—"}</strong>
        </div>
      </div>
      <div className={styles.toolbar}>
        {!active && (
          <form method="post" action="/api/billing/checkout?plan=team">
            <button className="button button-primary" type="submit">
              Start Team plan
            </button>
          </form>
        )}
        {billing?.stripeCustomerId && (
          <form method="post" action="/api/billing/portal">
            <button className="button button-outline" type="submit">
              Manage billing
            </button>
          </form>
        )}
        <Link className="button button-outline" href="/enterprise">
          Enterprise controls
        </Link>
      </div>
    </Panel>
  );
}

function Usage() {
  const preferences = useQuery(api.personal.preferences, {});
  if (!preferences) return <LoadingState label="Loading preferences…" />;
  return <UsageHistory defaultRange={preferences.defaultRange} />;
}
function UsageHistory({
  defaultRange,
}: {
  defaultRange: "7d" | "30d" | "90d" | "all";
}) {
  const summary = useQuery(api.personal.summary, {});
  const [start, setStart] = useState(() =>
    defaultRange === "all"
      ? "2020-01-01"
      : new Date(
          Date.now() -
            ((defaultRange === "7d" ? 7 : defaultRange === "90d" ? 90 : 30) -
              1) *
              86400000,
        )
          .toISOString()
          .slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [model, setModel] = useState("");
  const [source, setSource] = useState("");
  const rows = usePaginatedQuery(
    api.personal.usage,
    start && end && start <= end
      ? {
          startDay: start,
          endDay: end,
          model: model || undefined,
          source: source || undefined,
        }
      : "skip",
    { initialNumItems: 40 },
  );
  const views = useQuery(api.personal.savedViews, {});
  const save = useMutation(api.personal.saveView);
  const remove = useMutation(api.personal.removeView);
  const { run } = useContext(Operations);
  const stats = summary?.stats;
  return (
    <>
      <div className={styles.stats}>
        <div>
          <span>Lifetime tokens</span>
          <strong>{numeric.format(stats?.totalTokens ?? 0)}</strong>
        </div>
        <div>
          <span>Tracked cost · not an invoice</span>
          <strong>{money(stats?.totalCostMicros)}</strong>
        </div>
        <div>
          <span>Active days</span>
          <strong>{stats?.activeDays ?? 0}</strong>
        </div>
        <div>
          <span>Connected devices</span>
          <strong>{stats?.deviceCount ?? 0}</strong>
        </div>
      </div>
      <Panel
        title="History"
        eyebrow="REPORTING"
        action={
          <a href="/api/workspace/export?dataset=daily">Export all history ↗</a>
        }
      >
        <div className={styles.form}>
          <Field label="From (UTC)">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Through (UTC)">
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">All models</option>
              {summary?.models.map((m) => (
                <option key={m._id} value={m.model}>
                  {m.model}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All sources</option>
              {stats?.sources?.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Table
          headings={[
            "Date",
            "Model / source",
            "Tokens",
            "Tracked cost",
            "Basis",
            "Requests",
          ]}
        >
          {rows.results.map((row) => (
            <tr key={row._id}>
              <td>{row.day}</td>
              <td>
                {row.model}
                <small>{row.source}</small>
              </td>
              <td>{numeric.format(row.totalTokens)}</td>
              <td>{money(row.costMicros)}</td>
              <td>{row.costBasis ?? "unknown"}</td>
              <td>{row.requests}</td>
            </tr>
          ))}
        </Table>
        {rows.status === "LoadingFirstPage" ? (
          <LoadingState label="Loading history…" />
        ) : (
          !rows.results.length && (
            <Empty>
              No retained usage in this range. Connect a device or choose
              earlier dates.
            </Empty>
          )
        )}
        <More status={rows.status} load={rows.loadMore} />
        <p className={styles.hint}>
          Daily buckets remain UTC for consistent accounting. Coverage starts{" "}
          {stats?.firstDay ?? "after your first upload"}.{" "}
          {stats?.sessionCoverage === "complete"
            ? "Session coverage reported complete."
            : "Session coverage is partial or unconfirmed."}{" "}
          Provider invoices are separate.
        </p>
      </Panel>
      <Panel title="Saved views" eyebrow="SHORTCUTS">
        <div className={styles.toolbar}>
          {views?.map((view) => (
            <span key={view._id}>
              <button
                className={styles.textButton}
                onClick={() => {
                  setStart(view.startDay);
                  setEnd(view.endDay);
                  setModel(view.model ?? "");
                  setSource(view.source ?? "");
                }}
              >
                {view.name}
              </button>
              <button
                className={styles.textButton}
                aria-label={`Delete ${view.name}`}
                onClick={() => void run(() => remove({ id: view._id }))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <Form
          submit={(data) =>
            save({
              name: text(data, "name"),
              startDay: start,
              endDay: end,
              model: model || undefined,
              source: source || undefined,
            })
          }
        >
          <Field label="Save these filters as">
            <input name="name" required maxLength={60} />
          </Field>
          <Button>Save view</Button>
        </Form>
      </Panel>
    </>
  );
}

function Activity() {
  const dateTime = useDateTime();
  const agents = usePaginatedQuery(
    api.activity.agents,
    {},
    { initialNumItems: 40 },
  );
  const [since] = useState(() => Date.now() - 30 * 86400000);
  const outcomes = usePaginatedQuery(
    api.activity.outcomes,
    { startAt: since },
    { initialNumItems: 30 },
  );
  return (
    <>
      <Panel title="Agents" eyebrow="TELEMETRY">
        <p className={styles.hint}>
          Observed metadata only. Parent links require a collector-supplied
          parent ID; these counts are not added to lifetime totals.
        </p>
        <Table
          headings={[
            "Agent",
            "Parent",
            "Model",
            "Last state",
            "Tokens",
            "Tools / errors",
            "Last observed",
          ]}
        >
          {agents.results.map((agent) => (
            <tr key={agent._id}>
              <td>
                {agent.name}
                <small>{agent.task || agent.externalId}</small>
              </td>
              <td>{agent.parentExternalId ?? "—"}</td>
              <td>{agent.model}</td>
              <td>
                {agent.state}
                <small>Last reported; not a liveness guarantee</small>
              </td>
              <td>{numeric.format(agent.totalTokens)}</td>
              <td>
                {agent.toolCalls} / {agent.errorCount}
              </td>
              <td>{dateTime(agent.updatedAt)}</td>
            </tr>
          ))}
        </Table>
        {!agents.results.length && (
          <Empty>
            No agent telemetry received. Historical token imports do not
            fabricate live agents.
          </Empty>
        )}
        <More status={agents.status} load={agents.loadMore} />
      </Panel>
      <Panel title="Outcomes · last 30 days" eyebrow="SIGNALS">
        <Table headings={["Request", "Outcome", "Observed"]}>
          {outcomes.results.map((row) => (
            <tr key={row._id}>
              <td>{row.logicalRequestId}</td>
              <td>{row.outcome}</td>
              <td>{dateTime(row.occurredAt)}</td>
            </tr>
          ))}
        </Table>
        {!outcomes.results.length && (
          <Empty>
            No outcomes supplied. Token volume alone is not a productivity
            measurement.
          </Empty>
        )}
        <More status={outcomes.status} load={outcomes.loadMore} />
      </Panel>
    </>
  );
}

export function Teams({ overview }: { overview: Overview }) {
  const canManage = overview.capabilities["members:manage"];
  const members = usePaginatedQuery(
    api.workspaces.members,
    canManage ? {} : "skip",
    { initialNumItems: 40 },
  );
  const invitations = usePaginatedQuery(
    api.workspaces.invitations,
    canManage ? {} : "skip",
    { initialNumItems: 20 },
  );
  const createTeam = useMutation(api.workspaces.createTeam);
  const saveProject = useMutation(api.workspaces.saveProject);
  const invite = useAction(api.organizationActions.invite);
  const manageInvite = useAction(api.organizationActions.manageInvitation);
  const changeMember = useAction(api.organizationActions.changeMember);
  const { run } = useContext(Operations);
  const [selectedTeam, setSelectedTeam] = useState<Id<"teams"> | null>(null);
  return (
    <>
      <div className={styles.split}>
        <Panel title="Teams" eyebrow="PEOPLE">
          <div className={styles.list}>
            {overview.teams
              .filter((t) => !t.archivedAt)
              .map((team) => (
                <button
                  className={`button button-outline ${styles.item}`}
                  key={team._id}
                  onClick={() => setSelectedTeam(team._id)}
                >
                  {team.name}
                  <span className={styles.hint}>{team.description}</span>
                </button>
              ))}
          </div>
          {!overview.teams.length && (
            <Empty>Create a team to group people and allocate costs.</Empty>
          )}
          {canManage && (
            <Form
              submit={(data) =>
                createTeam({
                  name: text(data, "name"),
                  description: text(data, "description"),
                })
              }
            >
              <Field label="Team name">
                <input name="name" required maxLength={80} />
              </Field>
              <Field label="Description">
                <input name="description" maxLength={300} />
              </Field>
              <Button>Create team</Button>
            </Form>
          )}
        </Panel>
        <Panel title="Projects & cost centers" eyebrow="ALLOCATION">
          {overview.projects.map((p) => (
            <p className={styles.item} key={p._id}>
              {p.name}
              <small>
                {p.key} · {p.costCenter || "No cost center"}
                {p.archivedAt ? " · Archived" : ""}
              </small>
            </p>
          ))}
          {canManage && (
            <Form
              submit={(data) =>
                saveProject({
                  name: text(data, "name"),
                  key: text(data, "key"),
                  costCenter: text(data, "costCenter"),
                  teamId: (text(data, "team") || undefined) as
                    Id<"teams"> | undefined,
                  archived: false,
                })
              }
            >
              <Field label="Project name">
                <input name="name" required maxLength={80} />
              </Field>
              <Field label="Key">
                <input name="key" required pattern="[a-z0-9][a-z0-9_-]{0,63}" />
              </Field>
              <Field label="Cost center">
                <input name="costCenter" maxLength={80} />
              </Field>
              <Field label="Team">
                <select name="team">
                  <option value="">Unassigned</option>
                  {overview.teams.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button>Add project</Button>
            </Form>
          )}
        </Panel>
      </div>
      {selectedTeam && (
        <TeamMembers
          teamId={selectedTeam}
          overview={overview}
          members={members.results}
        />
      )}
      {canManage && (
        <Panel title="People">
          <Table headings={["Member", "Role", "Status", "Access"]}>
            {members.results.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <small>{m.email}</small>
                </td>
                <td>{m.role}</td>
                <td>
                  {m.status}
                  {m.source === "directory" ? " · Directory managed" : ""}
                </td>
                <td>
                  {m.userId !== overview.userId &&
                    m.status === "active" &&
                    m.role !== "owner" &&
                    m.source !== "directory" && (
                      <>
                        <select
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          onChange={(e) =>
                            void run(
                              () =>
                                changeMember({
                                  userId: m.userId,
                                  role: e.target.value as Role,
                                  remove: false,
                                }),
                              "Role updated. This member must refresh their session.",
                            )
                          }
                        >
                          {[
                            "admin",
                            "finance",
                            "manager",
                            "member",
                            "auditor",
                            "viewer",
                          ].map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${m.name} from this workspace and revoke their devices?`,
                              )
                            )
                              void run(() =>
                                changeMember({
                                  userId: m.userId,
                                  role: "member",
                                  remove: true,
                                }),
                              );
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                </td>
              </tr>
            ))}
          </Table>
          <More status={members.status} load={members.loadMore} />
          {overview.workspace.organizationId ? (
            <Form
              submit={(data) =>
                invite({
                  email: text(data, "email"),
                  role: text(data, "role") as Role,
                  teamId: (text(data, "team") || undefined) as
                    Id<"teams"> | undefined,
                })
              }
            >
              <Field label="Email">
                <input name="email" type="email" required maxLength={254} />
              </Field>
              <Field label="Role">
                <select name="role" defaultValue="member">
                  {[
                    "member",
                    "manager",
                    "finance",
                    "auditor",
                    "viewer",
                    "admin",
                  ].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </Field>
              <Field label="Initial team">
                <select name="team">
                  <option value="">None</option>
                  {overview.teams.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button>Send invitation</Button>
            </Form>
          ) : (
            <p className={styles.hint}>
              Create a company workspace to invite people. Your personal data
              stays here.
            </p>
          )}
          {invitations.results.map((invitation) => (
            <div className={styles.item} key={invitation._id}>
              <span>
                {invitation.email} · {invitation.role} · {invitation.state}
              </span>
              {invitation.externalId.startsWith("pending:") && (
                <button
                  className={styles.textButton}
                  onClick={() =>
                    void run(
                      () =>
                        manageInvite({
                          id: invitation._id,
                          operation: "reconcile",
                        }),
                      "Invitation status refreshed.",
                    )
                  }
                >
                  Check delivery status
                </button>
              )}
              {invitation.state === "pending" &&
                !invitation.externalId.startsWith("pending:") && (
                  <div>
                    <button
                      className={styles.textButton}
                      onClick={() =>
                        void run(() =>
                          manageInvite({
                            id: invitation._id,
                            operation: "resend",
                          }),
                        )
                      }
                    >
                      Resend
                    </button>
                    <button
                      className={styles.textButton}
                      onClick={() =>
                        void run(() =>
                          manageInvite({
                            id: invitation._id,
                            operation: "revoke",
                          }),
                        )
                      }
                    >
                      Revoke
                    </button>
                  </div>
                )}
            </div>
          ))}
          <More status={invitations.status} load={invitations.loadMore} />
        </Panel>
      )}
    </>
  );
}
function TeamMembers({
  teamId,
  overview,
  members,
}: {
  teamId: Id<"teams">;
  overview: Overview;
  members: FunctionReturnType<typeof api.workspaces.members>["page"];
}) {
  const dateTime = useDateTime();
  const rows = usePaginatedQuery(
    api.workspaces.teamMembers,
    { teamId },
    { initialNumItems: 40 },
  );
  const setMember = useMutation(api.workspaces.setTeamMember);
  const { run } = useContext(Operations);
  return (
    <Panel
      title={`${overview.teams.find((t) => t._id === teamId)?.name ?? "Team"} members`}
    >
      <Table headings={["Name", "Team role", "Joined", ""]}>
        {rows.results.map((row) => (
          <tr key={row._id}>
            <td>{row.name}</td>
            <td>{row.manager ? "Manager" : "Member"}</td>
            <td>{dateTime(row.joinedAt)}</td>
            <td>
              {overview.capabilities["teams:manage"] && (
                <button
                  onClick={() =>
                    void run(() =>
                      setMember({
                        teamId,
                        memberUserId: row.userId,
                        manager: false,
                        remove: true,
                      }),
                    )
                  }
                >
                  Remove from team
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <More status={rows.status} load={rows.loadMore} />
      {overview.capabilities["members:manage"] && (
        <Form
          submit={(data) =>
            setMember({
              teamId,
              memberUserId: text(data, "member") as Id<"users">,
              manager: text(data, "manager") === "on",
              remove: false,
            })
          }
        >
          <Field label="Member">
            <select name="member" required>
              {members
                .filter((m) => m.status === "active")
                .map((m) => (
                  <option key={m.id} value={m.userId}>
                    {m.name} · {m.email}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Team manager">
            <input name="manager" type="checkbox" />
          </Field>
          <Button>Add to team</Button>
        </Form>
      )}
    </Panel>
  );
}

export function Ledger({ overview }: { overview: Overview }) {
  const [month, setMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const summary = useQuery(api.finance.summary, { month });
  const reconciliation = useQuery(api.finance.reconciliation, {
    month,
    currency: "USD",
  });
  const rows = usePaginatedQuery(
    api.finance.entries,
    { startDay: `${month}-01`, endDay: `${month}-31` },
    { initialNumItems: 40 },
  );
  const record = useMutation(api.finance.record);
  const remove = useMutation(api.finance.remove);
  const allocate = useMutation(api.finance.allocate);
  const { run } = useContext(Operations);
  return (
    <>
      <Panel
        title="Financial ledger"
        eyebrow="RECONCILIATION"
        action={
          <a href="/api/workspace/export?dataset=ledger">Export ledger ↗</a>
        }
      >
        <div className={styles.form}>
          <Field label="Month (UTC)">
            <input
              type="month"
              required
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </Field>
        </div>
        <p className={styles.hint}>{summary?.explanation}</p>
        <div className={styles.toolbar}>
          {summary?.totals.map((total) => (
            <div className={styles.item} key={total._id}>
              <span className={styles.badge}>
                {total.basis} · {total.currency}
              </span>
              <strong>{money(total.amountMicros, total.currency)}</strong>
            </div>
          ))}
        </div>
        <Table
          headings={[
            "Date",
            "Provider / account",
            "Basis",
            "Amount",
            "Kind",
            "Project",
            "",
          ]}
        >
          {rows.results.map((row) => (
            <tr key={row._id}>
              <td>{row.day}</td>
              <td>
                {row.provider}
                <small>
                  {row.account} {row.invoiceId && `· ${row.invoiceId}`}
                </small>
              </td>
              <td>{row.basis}</td>
              <td>{money(row.amountMicros, row.currency)}</td>
              <td>{row.kind}</td>
              <td>
                {overview.capabilities["finance:manage"] ? (
                  <select
                    aria-label={`Project for ${row.provider} on ${row.day}`}
                    value={row.projectId ?? ""}
                    onChange={(e) => {
                      const project = overview.projects.find(
                        (p) => p._id === e.target.value,
                      );
                      void run(() =>
                        allocate({
                          entryId: row._id,
                          projectId: project?._id,
                          teamId: project?.teamId,
                        }),
                      );
                    }}
                  >
                    <option value="">Unallocated</option>
                    {overview.projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  (overview.projects.find((p) => p._id === row.projectId)
                    ?.name ?? "—")
                )}
              </td>
              <td>
                {row.source === "manual" &&
                  overview.capabilities["finance:manage"] && (
                    <button
                      onClick={() => {
                        if (confirm("Remove this manual financial record?"))
                          void run(() => remove({ entryId: row._id }));
                      }}
                    >
                      Remove
                    </button>
                  )}
              </td>
            </tr>
          ))}
        </Table>
        {!rows.results.length && (
          <Empty>
            No financial records this month. Import provider reports or record
            invoices below.
          </Empty>
        )}
        <More status={rows.status} load={rows.loadMore} />
      </Panel>
      <div className={styles.split}>
        <Panel title="Reconciliation · USD" eyebrow="CONTROL">
          <span className={styles.badge}>
            {reconciliation?.status?.replaceAll("_", " ") ?? "Pending"}
          </span>
          <p>
            Billed {money(reconciliation?.billedMicros)} · Reported{" "}
            {money(reconciliation?.reportedMicros)}
          </p>
          <p>Difference {money(reconciliation?.differenceMicros)}</p>
          <p className={styles.hint}>{reconciliation?.note}</p>
        </Panel>
        {overview.capabilities["finance:manage"] && (
          <Panel title="Record a charge or invoice" eyebrow="MANUAL ENTRY">
            <Form
              submit={(data) =>
                record({
                  entries: [
                    {
                      externalKey: text(data, "key"),
                      provider: text(data, "provider"),
                      account: text(data, "account"),
                      day: text(data, "day"),
                      currency: text(data, "currency").toUpperCase(),
                      amountMicros: micros(data.get("amount")),
                      kind: text(data, "kind") as "usage",
                      basis: text(data, "basis") as "billed",
                      invoiceId: text(data, "invoice") || undefined,
                      note: text(data, "note"),
                    },
                  ],
                })
              }
            >
              <Field label="Unique record ID (same ID corrects a record)">
                <input name="key" required maxLength={180} />
              </Field>
              <Field label="Provider">
                <input name="provider" required maxLength={80} />
              </Field>
              <Field label="Account">
                <input name="account" maxLength={100} />
              </Field>
              <Field label="Date">
                <input type="date" name="day" required />
              </Field>
              <Field label="Amount">
                <input name="amount" inputMode="decimal" required />
              </Field>
              <Field label="Currency">
                <input
                  name="currency"
                  defaultValue="USD"
                  pattern="[A-Za-z]{3}"
                  required
                />
              </Field>
              <Field label="Kind">
                <select name="kind">
                  {["usage", "subscription", "credit", "adjustment"].map(
                    (k) => (
                      <option key={k}>{k}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Evidence basis">
                <select name="basis" defaultValue="billed">
                  {["billed", "reported", "estimated"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice reference">
                <input name="invoice" maxLength={100} />
              </Field>
              <Field label="Note">
                <input name="note" maxLength={500} />
              </Field>
              <Button>Save record</Button>
            </Form>
          </Panel>
        )}
      </div>
    </>
  );
}

export function Budgets({ editable }: { editable: boolean }) {
  const dateTime = useDateTime();
  const rows = useQuery(api.budgets.list, {});
  const save = useMutation(api.budgets.save);
  const remove = useMutation(api.budgets.remove);
  const { run } = useContext(Operations);
  if (!rows)
    return (
      <Panel title="Monthly budgets" eyebrow="GUARDRAILS">
        <LoadingState label="Loading budgets…" />
      </Panel>
    );
  return (
    <Panel title="Monthly budgets" eyebrow="GUARDRAILS">
      <p className={styles.hint}>
        In-app alerts at your threshold, checked every 30 minutes. These do not
        block provider spending.
      </p>
      <div className={styles.list}>
        {rows?.map((row) => (
          <div className={styles.item} key={row._id}>
            <div className={styles.sectionHeader}>
              <strong>{row.name}</strong>
              <span>
                {money(row.observedMicros, row.currency)} /{" "}
                {money(row.limitMicros, row.currency)}
              </span>
            </div>
            <progress
              aria-label={`${row.name} budget used`}
              max={row.limitMicros}
              value={Math.max(0, row.observedMicros ?? 0)}
            />
            <small>
              {row.source === "tracked"
                ? "Tracked cost"
                : `${row.basis} ledger`}{" "}
              · Alert at {row.thresholdPercent}% ·{" "}
              {row.enabled ? "Enabled" : "Paused"} · {dateTime(row.evaluatedAt)}
            </small>
            {editable && (
              <div>
                <button
                  className={styles.textButton}
                  onClick={() =>
                    void run(() =>
                      save({
                        id: row._id,
                        name: row.name,
                        limitMicros: row.limitMicros,
                        currency: row.currency,
                        source: row.source,
                        basis: row.basis,
                        thresholdPercent: row.thresholdPercent,
                        enabled: !row.enabled,
                      }),
                    )
                  }
                >
                  {row.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  className={styles.textButton}
                  onClick={() => void run(() => remove({ id: row._id }))}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!rows?.length && (
        <Empty>
          Set a monthly target without putting your history behind a paywall.
        </Empty>
      )}
      {editable && (
        <Form
          submit={(data) => {
            const source = text(data, "source");
            return save({
              name: text(data, "name"),
              limitMicros: micros(data.get("amount")),
              currency: text(data, "currency"),
              source: source === "tracked" ? "tracked" : "ledger",
              basis:
                source === "tracked" ? "estimated" : (source as "reported"),
              thresholdPercent: Number(data.get("threshold")),
              enabled: true,
            });
          }}
        >
          <Field label="Budget name">
            <input name="name" required maxLength={80} />
          </Field>
          <Field label="Monthly amount">
            <input name="amount" required inputMode="decimal" />
          </Field>
          <Field label="Currency">
            <input
              name="currency"
              defaultValue="USD"
              required
              pattern="[A-Z]{3}"
            />
          </Field>
          <Field label="Cost source">
            <select name="source">
              <option value="tracked">Tracked usage (USD)</option>
              <option value="reported">Provider-reported ledger</option>
              <option value="billed">Billed ledger</option>
              <option value="estimated">Estimated ledger</option>
            </select>
          </Field>
          <Field label="Alert at (%)">
            <input
              name="threshold"
              type="number"
              min={1}
              max={100}
              defaultValue={80}
              required
            />
          </Field>
          <Button>Create budget</Button>
        </Form>
      )}
    </Panel>
  );
}

function Savings({ editable }: { editable: boolean }) {
  const rows = usePaginatedQuery(api.savings.list, {}, { initialNumItems: 30 });
  const save = useMutation(api.savings.save);
  const [editing, setEditing] = useState<Doc<"savingsActions"> | null>(null);
  return (
    <Panel title="Savings register" eyebrow="OPTIMIZATION">
      <p className={styles.hint}>
        Propose a change, approve it, measure it, then record the result.
        Potential savings never masquerade as measured savings.
      </p>
      <Table headings={["Action", "State", "Potential", "Observed", ""]}>
        {rows.results.map((row) => (
          <tr key={row._id}>
            <td>
              {row.title}
              <small>{row.evidence}</small>
            </td>
            <td>{row.state}</td>
            <td>{money(row.potentialMicros, row.currency)}</td>
            <td>
              {row.state === "verified"
                ? money(row.observedMicros, row.currency)
                : "Not verified"}
            </td>
            <td>
              {editable && (
                <button onClick={() => setEditing(row)}>Update</button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <More status={rows.status} load={rows.loadMore} />
      {editable && (
        <div key={editing?._id ?? "new"}>
          <h3>{editing ? "Update measurement" : "Propose an improvement"}</h3>
          <Form
            submit={async (data) => {
              await save({
                id: editing?._id,
                title: text(data, "title"),
                description: text(data, "description"),
                evidence: text(data, "evidence"),
                currency: text(data, "currency"),
                potentialMicros: micros(data.get("potential")),
                observedMicros: text(data, "observed")
                  ? micros(data.get("observed"))
                  : undefined,
                baseline: text(data, "baseline") || undefined,
                resultEvidence: text(data, "result") || undefined,
                state: text(data, "state") as "proposed",
              });
              setEditing(null);
            }}
          >
            <Field label="Action">
              <input
                name="title"
                required
                maxLength={100}
                defaultValue={editing?.title}
              />
            </Field>
            <Field label="Potential amount">
              <input
                name="potential"
                required
                inputMode="decimal"
                defaultValue={(editing?.potentialMicros ?? 0) / 1e6}
              />
            </Field>
            <Field label="Currency">
              <input
                name="currency"
                pattern="[A-Z]{3}"
                defaultValue={editing?.currency ?? "USD"}
                required
              />
            </Field>
            <Field label="State">
              <select name="state" defaultValue={editing?.state ?? "proposed"}>
                {(editing
                  ? [
                      "proposed",
                      "approved",
                      "measuring",
                      "verified",
                      "dismissed",
                    ]
                  : ["proposed"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Description" wide>
              <input
                name="description"
                maxLength={1000}
                defaultValue={editing?.description}
              />
            </Field>
            <Field label="Evidence / source" wide>
              <input
                name="evidence"
                required
                maxLength={1000}
                defaultValue={editing?.evidence}
              />
            </Field>
            {editing && (
              <>
                <Field label="Baseline">
                  <input
                    name="baseline"
                    maxLength={1000}
                    defaultValue={editing.baseline}
                  />
                </Field>
                <Field label="Observed amount">
                  <input
                    name="observed"
                    inputMode="decimal"
                    defaultValue={
                      editing.observedMicros === undefined
                        ? ""
                        : editing.observedMicros / 1e6
                    }
                  />
                </Field>
                <Field label="Result evidence">
                  <input
                    name="result"
                    maxLength={1000}
                    defaultValue={editing.resultEvidence}
                  />
                </Field>
              </>
            )}
            <Button>{editing ? "Save measurement" : "Add proposal"}</Button>
            {editing && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            )}
          </Form>
        </div>
      )}
    </Panel>
  );
}

function Connections() {
  const dateTime = useDateTime();
  const rows = useQuery(api.connections.list, {});
  const connect = useAction(api.providerActions.connect);
  const disconnect = useMutation(api.connections.disconnect);
  const { run } = useContext(Operations);
  return (
    <>
      <Panel title="Provider connections" eyebrow="SOURCES">
        <p className={styles.hint}>
          One server-side import per connection. Credentials are encrypted,
          never returned to the browser, and removed on disconnect. Imports are
          separate from collector token totals.
        </p>
        {!rows ? (
          <LoadingState label="Loading connections…" />
        ) : (
          <div className={styles.list}>
            {rows.map((row) => (
              <div className={styles.item} key={row.id}>
                <div className={styles.sectionHeader}>
                  <strong>
                    {row.name} · {row.provider}
                  </strong>
                  <span className={styles.badge}>{row.state}</span>
                </div>
                <p>{row.coverageNote}</p>
                <small>
                  Coverage {row.coverageStartDay ?? "pending"} →{" "}
                  {row.coverageEndDay ?? "pending"} · Last success{" "}
                  {dateTime(row.lastSuccessAt)}
                  {row.reportedSeats !== undefined &&
                    ` · ${row.reportedSeats} reported seats`}
                </small>
                {row.lastError && (
                  <p role="alert">
                    {row.lastError.replaceAll("_", " ")}. Reconnect to retry.
                  </p>
                )}
                <button
                  className={styles.textButton}
                  onClick={() => {
                    if (
                      confirm(
                        `Disconnect ${row.name} and remove its stored credential?`,
                      )
                    )
                      void run(() => disconnect({ id: row.id }));
                  }}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Connect or replace a credential" eyebrow="ADD SOURCE">
        <Form
          submit={(data) =>
            connect({
              provider: text(data, "provider") as "anthropic",
              name: text(data, "name"),
              accountId: text(data, "account"),
              startDay: text(data, "start"),
              credential: text(data, "credential"),
            })
          }
        >
          <Field label="Provider">
            <select name="provider">
              <option value="anthropic">Anthropic Console cost report</option>
              <option value="cursor">Cursor chargeable usage</option>
              <option value="github">GitHub Copilot seat inventory</option>
            </select>
          </Field>
          <Field label="Connection name">
            <input name="name" required maxLength={80} />
          </Field>
          <Field label="Account identifier (GitHub: organization slug)">
            <input name="account" required maxLength={100} />
          </Field>
          <Field label="Import from">
            <input
              name="start"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Authorized read-only API credential" wide>
            <input
              name="credential"
              type="password"
              autoComplete="new-password"
              required
              maxLength={4096}
            />
          </Field>
          <Button>Connect securely</Button>
        </Form>
        <p className={styles.hint}>
          Use the same provider and account identifier to rotate credentials.
          Historical imports advance in bounded daily jobs. API scope and
          retained history determine coverage; a connection is not a guarantee
          of complete billing data.
        </p>
      </Panel>
    </>
  );
}

function Settings({ overview }: { overview: Overview }) {
  const dateTime = useDateTime();
  const preferences = useQuery(api.personal.preferences, {});
  const savePreferences = useMutation(api.personal.savePreferences);
  const configure = useMutation(api.workspaces.configureWorkspace);
  const admin = useAction(api.organizationActions.adminPortal);
  const notices = usePaginatedQuery(
    api.personal.notifications,
    {},
    { initialNumItems: 20 },
  );
  const read = useMutation(api.personal.readNotification);
  const { run } = useContext(Operations);
  return (
    <>
      <div className={styles.split}>
        <Panel title="Preferences" eyebrow="PERSONAL">
          {preferences ? (
            <Form
              submit={(data) =>
                savePreferences({
                  timezone: text(data, "timezone"),
                  weekStartsOn: preferences.weekStartsOn,
                  defaultRange: text(data, "range") as "30d",
                  notificationBudgets: text(data, "budgets") === "on",
                  notificationCoverage: text(data, "coverage") === "on",
                })
              }
            >
              <Field label="Timezone (IANA)">
                <input
                  name="timezone"
                  defaultValue={preferences.timezone}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Default history range">
                <select name="range" defaultValue={preferences.defaultRange}>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="90d">90 days</option>
                  <option value="all">All history</option>
                </select>
              </Field>
              <Field label="Budget notifications">
                <input
                  type="checkbox"
                  name="budgets"
                  defaultChecked={preferences.notificationBudgets}
                />
              </Field>
              <Field label="Coverage notifications">
                <input
                  type="checkbox"
                  name="coverage"
                  defaultChecked={preferences.notificationCoverage}
                />
              </Field>
              <Button>Save preferences</Button>
            </Form>
          ) : (
            <LoadingState label="Loading preferences…" />
          )}
          <p className={styles.hint}>
            Timestamps use your selected timezone. History and budgets retain
            UTC accounting boundaries so totals agree across devices.
          </p>
        </Panel>
        <Panel title="Your data, without a paywall" eyebrow="EXPORTS">
          <div className={styles.toolbar}>
            <a
              className="button button-outline"
              href="/api/workspace/export?dataset=daily"
            >
              Daily usage
            </a>
            <a
              className="button button-outline"
              href="/api/workspace/export?dataset=models"
            >
              Models
            </a>
            {overview.capabilities["audit:read"] && (
              <a
                className="button button-outline"
                href="/api/workspace/export?dataset=audit"
              >
                Audit log
              </a>
            )}
            <Link className="button button-outline" href="/account">
              Privacy & deletion
            </Link>
          </div>
          <p className={styles.hint}>
            Exports stream every page as NDJSON, not a 500-row sample. They
            reflect live data, not a frozen accounting snapshot; the final line
            marks successful completion.
          </p>
        </Panel>
      </div>
      {overview.capabilities["workspace:manage"] && (
        <Panel title="Workspace settings" eyebrow="GOVERNANCE">
          <Form
            submit={(data) =>
              configure({
                name: text(data, "name"),
                retentionDays: Number(data.get("days")),
              })
            }
          >
            <Field label="Name">
              <input
                name="name"
                defaultValue={overview.workspace.name}
                maxLength={80}
                required
              />
            </Field>
            <Field label="Detailed telemetry retention (days)">
              <input
                name="days"
                type="number"
                min={1}
                max={overview.policy.enterprise ? 365 : 30}
                defaultValue={overview.workspace.retentionDays}
                required
              />
            </Field>
            <Button>Save settings</Button>
          </Form>
          <p className={styles.hint}>
            Retention applies to detailed telemetry. Historical daily totals are
            not deleted by this setting. Free: 10 members, 5 teams, 25 devices.
            Enterprise capacity is contracted.
          </p>
          {overview.policy.enterprise && (
            <div className={styles.toolbar}>
              {(["sso", "dsync", "domain_verification"] as const).map(
                (intent) => (
                  <button
                    className="button button-outline"
                    key={intent}
                    onClick={() =>
                      void run(async () => {
                        const result = await admin({ intent });
                        window.location.assign(result.url);
                      }, "Opening secure administration…")
                    }
                  >
                    {intent === "sso"
                      ? "Configure SSO"
                      : intent === "dsync"
                        ? "Directory sync"
                        : "Verify domains"}
                  </button>
                ),
              )}
            </div>
          )}
        </Panel>
      )}
      <Panel title="Notifications" eyebrow="INBOX">
        <div className={styles.list}>
          {notices.results.map((notice) => (
            <div className={styles.item} key={notice._id}>
              <strong>{notice.title}</strong>
              <p>{notice.detail}</p>
              <small>{dateTime(notice.createdAt)}</small>
              {!notice.readAt && (
                <button
                  className={styles.textButton}
                  onClick={() =>
                    void run(() => read({ id: notice._id }), "Marked as read.")
                  }
                >
                  Mark as read
                </button>
              )}
            </div>
          ))}
        </div>
        {!notices.results.length && <Empty>You’re all caught up.</Empty>}
        <More status={notices.status} load={notices.loadMore} />
      </Panel>
    </>
  );
}
