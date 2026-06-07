import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  Globe2,
  Home,
  KeyRound,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ProviderStatus } from "@/app/components/admin/ProviderStatus";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { requireAdmin } from "@/app/lib/auth";
import { ADMIN_MODULES } from "@/app/lib/adminNavigation";
import { getOperationsCommandCenterState } from "@/app/lib/operationsCommandCenter";
import { formatDateTime } from "@/app/lib/marketplaceStatus";
import { readinessLabel } from "@/app/lib/operationsIntelligence";

const quickCommands = [
  { href: "/admin/property-trust", label: "Property Trust", Icon: Home },
  { href: "/admin/globalization?tab=inventory", label: "Translation Inventory", Icon: Globe2 },
  { href: "/admin/homepage-builder", label: "Homepage Builder", Icon: BadgeCheck },
  { href: "/admin/partner-operations", label: "Partner Queue", Icon: Users },
  { href: "/admin/bookings?segment=requires_attention", label: "Booking Attention", Icon: CalendarCheck },
  { href: "/admin/payments?status=requires_review", label: "Payment Review", Icon: CreditCard },
  { href: "/admin/disputes?priority=urgent", label: "Urgent Disputes", Icon: ShieldAlert },
  { href: "/admin/verifications?status=pending", label: "Pending Verifications", Icon: BadgeCheck },
  { href: "/admin/handover?status=issue_reported", label: "Handover Issues", Icon: KeyRound },
  { href: "/admin/premium-guests?status=under_review", label: "Premium Pipeline", Icon: Sparkles },
];

export default async function MarketplaceOperationsPage() {
  await requireAdmin();
  const state = await getOperationsCommandCenterState();
  const overallScore = state.healthMatrix.length
    ? Math.round(
        state.healthMatrix.reduce((sum, area) => sum + (area.score ?? 0), 0) /
          state.healthMatrix.length
      )
    : null;
  const trustQueue = state.queue.filter((item) =>
    ["Disputes", "Verifications"].includes(item.module)
  );
  const supplyQueue = state.queue.filter((item) =>
    ["Property Trust", "Partner Operations", "Globalization"].includes(item.module)
  );
  const moneyQueue = state.queue.filter((item) => item.module === "Payments");
  const handoverQueue = state.queue.filter((item) => item.module === "Handover");

  return (
    <ModuleShell
      title="Marketplace Operations"
      description="Live operating room for marketplace readiness, blockers, pipelines, provider configuration, and cross-module command actions."
      moduleStatus={state.blockers.length ? "requires_review" : "operational"}
      statusLabel={state.blockers.length ? `${state.blockers.length} blockers` : "Clear"}
      lastActivity={formatDateTime(state.latestAudit?.createdAt, "No audit yet")}
      environment={`PayPal ${state.paypal.environment}`}
      layout="operations"
      navigation={<OperationsNavigation />}
      intelligence={
        <IntelligencePanel
          title="Command intelligence"
          readiness={state.healthMatrix.slice(0, 4).map((area) => ({
            label: area.label,
            score: area.score,
            detail: area.detail,
          }))}
          blockers={state.blockers.slice(0, 5).map((blocker) => ({
            id: blocker.id,
            title: blocker.title,
            description: blocker.description,
            severity: blocker.severity,
            href: blocker.href,
            actionLabel: blocker.nextAction,
          }))}
          suggestions={state.queue.slice(0, 5).map((item) => ({
            id: item.id,
            title: item.nextAction,
            description: `${item.module}: ${item.reason}`,
            severity: item.severity,
            href: item.href,
            actionLabel: item.entityLabel,
          }))}
        >
          <ProviderStatus
            provider="PayPal"
            environment={state.paypal.environment}
            status={state.paypal.status}
            details={[
              { label: "Client ID", ok: state.paypal.hasClientId, value: state.paypal.hasClientId ? "Configured" : "Missing" },
              { label: "Secret", ok: state.paypal.hasSecret, value: state.paypal.hasSecret ? "Server-side" : "Missing" },
              { label: "Webhook", ok: state.paypal.hasWebhookId, value: state.paypal.hasWebhookId ? "Configured" : "Optional" },
            ]}
          />
        </IntelligencePanel>
      }
    >
      <div className="grid gap-5">
        <section className="grid gap-4 md:grid-cols-4">
          <KpiCard
            label="Marketplace readiness"
            value={overallScore === null ? "Foundation" : `${overallScore}%`}
            detail={readinessLabel(overallScore)}
            tone={overallScore !== null && overallScore < 60 ? "warning" : "success"}
          />
          <KpiCard
            label="Command queue"
            value={state.queue.length}
            detail="Prioritized live work items"
            tone={state.queue.length ? "warning" : "success"}
          />
          <KpiCard
            label="Supply work"
            value={supplyQueue.length}
            detail={`${state.counts.approvedListings} approved listings`}
            href="/admin/property-trust"
          />
          <KpiCard
            label="Trust and safety"
            value={trustQueue.length}
            detail={`${state.counts.disputes} disputes, ${state.counts.verifications} verifications`}
            href="/admin/disputes"
            tone={trustQueue.length ? "danger" : "success"}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-md border bg-background p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Readiness matrix</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Foundation is shown when no real records exist; scores are never fabricated.
                </p>
              </div>
              <StatusBadge status={state.blockers.length ? "requires_review" : "operational"} />
            </div>
            <div className="mt-5 grid gap-4">
              {state.healthMatrix.map((area) => (
                <Link key={area.id} href={area.href}>
                  <ReadinessMeter
                    label={area.label}
                    score={area.score}
                    detail={`${area.detail} Status: ${area.status.replaceAll("_", " ")}.`}
                  />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-background p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Open blocker queue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Real blockers only: provider setup, operational records, or stale inventory.
                </p>
              </div>
              <StatusBadge status={state.queue.length ? "requires_review" : "operational"} label={`${state.queue.length} items`} />
            </div>
            <div className="mt-5 space-y-3">
              {state.queue.length === 0 ? (
                <div className="rounded-md border border-dashed p-4">
                  <p className="font-medium">No command work is active</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    New blockers appear here when a real record requires operations attention.
                  </p>
                </div>
              ) : (
                state.queue.slice(0, 10).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="grid gap-3 rounded-md border p-4 transition-colors hover:border-foreground/30 md:grid-cols-[130px_minmax(0,1fr)_150px]"
                  >
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.module}
                      </p>
                      <StatusBadge className="mt-2" status={item.severity} label={item.severity} />
                    </div>
                    <div>
                      <p className="font-medium">{item.entityLabel}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{item.nextAction}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.ageLabel ?? "live"}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-4">
          <OperationsLane
            title="Supply pipeline"
            href="/admin/property-trust"
            items={[
              `${state.counts.approvedListings} approved public listings`,
              `${state.counts.pendingListings} listings pending review`,
              `${state.counts.translationProblems} stale or failed translation entries`,
              `${supplyQueue.length} supply blockers in queue`,
            ]}
          />
          <OperationsLane
            title="Booking and demand"
            href="/admin/bookings"
            items={[
              `${state.counts.reservations} active or upcoming reservations`,
              `${state.counts.users} non-admin accounts`,
              `${state.counts.upcomingWithoutHandover} upcoming stays missing handover`,
              `${handoverQueue.length} handover items in queue`,
            ]}
          />
          <OperationsLane
            title="Payment operations"
            href="/admin/payments"
            items={[
              `PayPal status: ${state.paypal.status.replaceAll("_", " ")}`,
              `${state.counts.payments} payment records needing attention`,
              `${moneyQueue.length} payment queue items`,
              state.paypal.isConfigured ? "Provider calls enabled server-side" : "Provider actions disabled until env is configured",
            ]}
          />
          <OperationsLane
            title="Trust and safety"
            href="/admin/disputes"
            items={[
              `${state.counts.disputes} active disputes`,
              `${state.counts.verifications} pending verification records`,
              `${state.counts.premiumProfiles} premium guest pipeline profiles`,
              `${trustQueue.length} trust queue items`,
            ]}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-md border bg-background p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Recent operations timeline</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Unified stream from admin audit, listing review, payment, dispute, verification,
              premium guest, and handover events.
            </p>
            <div className="mt-5">
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
          </div>

          <aside className="rounded-md border bg-background p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Quick command actions</h2>
            <div className="mt-4 grid gap-2">
              {quickCommands.map((action) => {
                const Icon = action.Icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:border-foreground/30"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {action.label}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          </aside>
        </section>
      </div>
    </ModuleShell>
  );
}

function OperationsNavigation() {
  return (
    <nav className="rounded-md border bg-background p-3 shadow-sm">
      <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Command modules
      </p>
      <div className="grid gap-1">
        {ADMIN_MODULES.map((moduleMeta) => (
          <Link
            key={moduleMeta.id}
            href={moduleMeta.href}
            className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {moduleMeta.title}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function OperationsLane({
  title,
  href,
  items,
}: {
  title: string;
  href: string;
  items: string[];
}) {
  return (
    <Link
      href={href}
      className="rounded-md border bg-background p-4 shadow-sm transition-colors hover:border-foreground/30"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </Link>
  );
}
