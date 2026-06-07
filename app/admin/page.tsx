import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  Database,
  GalleryVerticalEnd,
  Globe2,
  Handshake,
  Home,
  KeyRound,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { ProviderStatus } from "@/app/components/admin/ProviderStatus";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { requireAdmin } from "@/app/lib/auth";
import { ADMIN_MODULES } from "@/app/lib/adminNavigation";
import { getOperationsCommandCenterState } from "@/app/lib/operationsCommandCenter";
import { formatDateTime } from "@/app/lib/marketplaceStatus";

const iconMap = {
  activity: Activity,
  calendar: CalendarCheck,
  users: Users,
  handshake: Handshake,
  home: Home,
  gallery: GalleryVerticalEnd,
  globe: Globe2,
  sparkles: Sparkles,
  key: KeyRound,
  "credit-card": CreditCard,
  "shield-alert": ShieldAlert,
  "badge-check": BadgeCheck,
  settings: Settings,
};

function moduleIcon(id: string) {
  const moduleMeta = ADMIN_MODULES.find((item) => item.id === id);
  if (!moduleMeta) return Activity;
  return iconMap[moduleMeta.icon as keyof typeof iconMap] ?? Activity;
}

function moduleDescription(id: string) {
  return ADMIN_MODULES.find((item) => item.id === id)?.description ?? "Open module workspace.";
}

export default async function AdminPage() {
  await requireAdmin();
  const state = await getOperationsCommandCenterState();
  const openWork = state.queue.length;
  const criticalWork = state.queue.filter((item) => item.severity === "critical" || item.severity === "high").length;
  const averageHealth = state.healthMatrix.length
    ? Math.round(
        state.healthMatrix.reduce((sum, area) => sum + (area.score ?? 0), 0) /
          state.healthMatrix.length
      )
    : null;

  return (
    <section className="min-h-screen bg-slate-50/60">
      <div className="w-full max-w-none px-5 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <header className="rounded-md border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Kantara internal operations
                </p>
                <StatusBadge
                  status={criticalWork ? "requires_review" : "operational"}
                  label={criticalWork ? `${criticalWork} escalations` : "Operating"}
                />
                <StatusBadge status={state.paypal.status} />
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Kantara Command Center
              </h1>
              <p className="mt-3 max-w-3xl text-muted-foreground">
                Executive cockpit for supply, bookings, guests, partners, PayPal payments,
                disputes, verifications, premium guest eligibility, handover, localization,
                and system readiness.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
                  <Database className="h-3.5 w-3.5" />
                  Database connected
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
                  <Globe2 className="h-3.5 w-3.5" />
                  {state.localizationSettings
                    ? `${state.localizationSettings.enabledLanguages.split(",").filter(Boolean).length} languages`
                    : "Localization foundation"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1">
                  <Activity className="h-3.5 w-3.5" />
                  Last admin activity: {formatDateTime(state.latestAudit?.createdAt, "No audit yet")}
                </span>
              </div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3 xl:min-w-[440px]">
              <SummaryTile label="Open command work" value={openWork} />
              <SummaryTile label="Critical/high" value={criticalWork} tone={criticalWork ? "danger" : "success"} />
              <SummaryTile
                label="Marketplace health"
                value={averageHealth === null ? "Foundation" : `${averageHealth}%`}
                tone={averageHealth !== null && averageHealth < 60 ? "warning" : "success"}
              />
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_380px]">
          <main className="min-w-0 space-y-5">
            <section className="rounded-md border bg-background p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Today&apos;s command queue</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Prioritized from real partner, listing, booking, payment, dispute,
                    verification, handover, translation, and provider records.
                  </p>
                </div>
                <Link
                  href="/admin/marketplace-operations"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:border-foreground/30"
                >
                  Open operating room
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {state.queue.length === 0 ? (
                  <div className="rounded-md border border-dashed p-5">
                    <p className="font-medium">No active command queue items</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Operations are clear for the datasets currently present. New work appears
                      here when real records need review or provider setup is incomplete.
                    </p>
                  </div>
                ) : (
                  state.queue.slice(0, 12).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="grid gap-3 rounded-md border p-4 transition-colors hover:border-foreground/30 md:grid-cols-[150px_minmax(0,1fr)_180px]"
                    >
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {item.module}
                        </p>
                        <div className="mt-2">
                          <StatusBadge status={item.severity} label={item.severity} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.entityLabel}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium">{item.nextAction}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.ageLabel ?? "live signal"}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Marketplace health matrix</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Scores are derived from current records. Foundation states do not pretend
                    operational maturity when datasets are empty.
                  </p>
                </div>
                <StatusBadge
                  status={criticalWork ? "requires_review" : "operational"}
                  label={criticalWork ? "Needs command attention" : "No escalations"}
                />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {state.healthMatrix.map((area) => (
                  <Link key={area.id} href={area.href} className="block">
                    <ReadinessMeter
                      label={area.label}
                      score={area.score}
                      detail={`${area.detail} ${area.blockers} blocker${area.blockers === 1 ? "" : "s"}.`}
                    />
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Operational modules</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every module links to a real route, reports open work, and exposes the next
                operating action instead of static navigation.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {state.moduleSummaries.map((summary) => {
                  const Icon = moduleIcon(summary.id);
                  return (
                    <Link
                      key={summary.id}
                      href={summary.href}
                      className="group flex min-h-[220px] flex-col rounded-md border bg-background p-4 transition-colors hover:border-foreground/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </span>
                        <StatusBadge status={summary.severity} label={`${summary.openWork} open`} />
                      </div>
                      <h3 className="mt-4 font-semibold">{summary.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {moduleDescription(summary.id)}
                      </p>
                      <div className="mt-auto pt-5">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold">
                              {summary.count === null ? "Foundation" : summary.count}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {summary.providerState ?? summary.status.replaceAll("_", " ")}
                            </p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </div>
                        <p className="mt-3 border-t pt-3 text-xs font-medium">
                          {summary.nextAction}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </main>

          <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
            <ProviderStatus
              provider="PayPal"
              environment={state.paypal.environment}
              status={state.paypal.status}
              details={[
                {
                  label: "Client ID",
                  ok: state.paypal.hasClientId,
                  value: state.paypal.hasClientId ? "Configured" : "Missing",
                },
                {
                  label: "Secret",
                  ok: state.paypal.hasSecret,
                  value: state.paypal.hasSecret ? "Configured server-side" : "Missing",
                },
                {
                  label: "Webhook",
                  ok: state.paypal.hasWebhookId,
                  value: state.paypal.hasWebhookId ? "Configured" : "Optional",
                },
                {
                  label: "Card fields",
                  ok: state.paypal.hasPublicClientId,
                  value: state.paypal.cardFieldsStatus.replaceAll("_", " "),
                },
              ]}
            />

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Blockers and escalations</h2>
              <div className="mt-4 space-y-3">
                {state.blockers.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No active blockers are present for current records.
                  </p>
                ) : (
                  state.blockers.slice(0, 8).map((blocker) => (
                    <Link
                      key={blocker.id}
                      href={blocker.href}
                      className="block rounded-md border p-3 transition-colors hover:border-foreground/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{blocker.title}</p>
                        <StatusBadge status={blocker.severity} label={blocker.severity} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{blocker.description}</p>
                      <p className="mt-2 text-xs font-medium">{blocker.nextAction}</p>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">System readiness</h2>
              <div className="mt-4 grid gap-2 text-sm">
                <SystemRow label="Database" status="operational" detail="Prisma queries returned live admin state." />
                <SystemRow
                  label="Currency sync"
                  status={state.currencySettings?.lastSyncStatus === "failed" ? "requires_review" : "operational"}
                  detail={formatDateTime(state.currencySettings?.lastSyncAt, "not synced")}
                />
                <SystemRow
                  label="Localization"
                  status={state.localizationSettings ? "operational" : "foundation"}
                  detail={
                    state.localizationSettings
                      ? `${state.localizationSettings.enabledLanguages.split(",").filter(Boolean).length} enabled languages`
                      : "No localization settings record"
                  }
                />
                <SystemRow
                  label="Homepage builder"
                  status={state.homepageSections > 0 ? "operational" : "foundation"}
                  detail={`${state.homepageSections} homepage sections`}
                />
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <div className="mt-4">
                <Timeline
                  items={state.timeline.map((event) => ({
                    id: event.id,
                    type: event.type,
                    summary: `${event.module}: ${event.summary}`,
                    createdAt: event.createdAt,
                    actor: event.actorId,
                    href: event.href,
                  }))}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "bg-muted/30";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function SystemRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
