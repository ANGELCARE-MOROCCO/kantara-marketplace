import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Database,
  Globe2,
  LockKeyhole,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ProviderStatus } from "@/app/components/admin/ProviderStatus";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { requireAdmin } from "@/app/lib/auth";
import prisma from "@/app/lib/db";
import { ADMIN_MODULES } from "@/app/lib/adminNavigation";
import { getOperationsCommandCenterState } from "@/app/lib/operationsCommandCenter";
import { getPayPalProviderReadiness } from "@/app/lib/paypal";
import { formatDateTime } from "@/app/lib/marketplaceStatus";

async function getSettingsState() {
  const [
    users,
    homes,
    reservations,
    paymentRecords,
    disputes,
    verifications,
    premiumProfiles,
    handoverTasks,
    homepageSections,
    translationEntries,
    staleTranslations,
    currencySettings,
    localizationSettings,
    branding,
    latestAudit,
    command,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.home.count(),
    prisma.reservation.count(),
    prisma.paymentRecord.count(),
    prisma.disputeCase.count(),
    prisma.verificationRecord.count(),
    prisma.premiumGuestProfile.count(),
    prisma.handoverTask.count(),
    prisma.homepageSection.count(),
    prisma.translationEntry.count(),
    prisma.translationEntry.count({ where: { status: { in: ["failed", "stale"] } } }),
    prisma.currencySettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.localizationSettings.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.siteBranding.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.adminAuditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    getOperationsCommandCenterState(),
  ]);

  return {
    counts: {
      users,
      homes,
      reservations,
      paymentRecords,
      disputes,
      verifications,
      premiumProfiles,
      handoverTasks,
      homepageSections,
      translationEntries,
      staleTranslations,
    },
    currencySettings,
    localizationSettings,
    branding,
    latestAudit,
    paypal: getPayPalProviderReadiness(),
    command,
  };
}

export default async function SettingsPage() {
  await requireAdmin();
  const state = await getSettingsState();
  const averageReadiness = state.command.healthMatrix.length
    ? Math.round(
        state.command.healthMatrix.reduce((sum, area) => sum + (area.score ?? 0), 0) /
          state.command.healthMatrix.length
      )
    : null;

  return (
    <ModuleShell
      title="Settings"
      description="System control center for provider configuration, globalization, module readiness, payment status, public site readiness, security diagnostics, audit activity, and command-center shortcuts."
      moduleStatus={state.command.blockers.length ? "requires_review" : "operational"}
      statusLabel={state.command.blockers.length ? `${state.command.blockers.length} blockers` : "System clear"}
      environment={`PayPal ${state.paypal.environment}`}
      layout="split"
      intelligence={
        <IntelligencePanel
          title="System diagnostics"
          readiness={state.command.healthMatrix.slice(0, 5).map((area) => ({
            label: area.label,
            score: area.score,
            detail: area.detail,
          }))}
          blockers={state.command.blockers.slice(0, 5).map((blocker) => ({
            id: blocker.id,
            title: blocker.title,
            description: blocker.description,
            severity: blocker.severity,
            href: blocker.href,
            actionLabel: blocker.nextAction,
          }))}
          suggestions={[
            {
              id: "secrets",
              title: "Secrets remain server-side",
              description: "PayPal secret values are never rendered in Settings or client bundles.",
              severity: "info",
            },
            {
              id: "i18n",
              title: "Use translation inventory for fixed labels",
              description: "New admin labels are registered for scan/export/import workflows.",
              severity: "info",
            },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-4">
          <KpiCard label="Database" value="Connected" detail={`${state.counts.users} users, ${state.counts.homes} homes`} tone="success" />
          <KpiCard label="Marketplace readiness" value={averageReadiness === null ? "Foundation" : `${averageReadiness}%`} detail="Derived from command-center matrix" />
          <KpiCard label="PayPal" value={state.paypal.environment} detail={state.paypal.status.replaceAll("_", " ")} tone={state.paypal.isConfigured ? "success" : "warning"} />
          <KpiCard label="Latest audit" value={state.latestAudit ? "Recorded" : "No events"} detail={formatDateTime(state.latestAudit?.createdAt, "No audit events yet")} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <ProviderStatus
              provider="PayPal"
              environment={state.paypal.environment}
              status={state.paypal.status}
              details={[
                { label: "Client ID", ok: state.paypal.hasClientId, value: state.paypal.hasClientId ? "Configured" : "Missing" },
                { label: "Secret", ok: state.paypal.hasSecret, value: state.paypal.hasSecret ? "Configured server-side" : "Missing" },
                { label: "Webhook", ok: state.paypal.hasWebhookId, value: state.paypal.hasWebhookId ? "Configured" : "Unconfigured" },
                { label: "Public SDK ID", ok: state.paypal.hasPublicClientId, value: state.paypal.hasPublicClientId ? "Configured" : "Not configured" },
              ]}
            />

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">System readiness dashboard</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <ReadinessMeter label="Database" score={100} detail="Prisma queries are returning admin state." />
                <ReadinessMeter
                  label="Storage"
                  score={null}
                  detail="Storage bucket check is managed by existing media/listing flows and is not exposed here."
                />
                <ReadinessMeter
                  label="Currency sync"
                  score={state.currencySettings?.lastSyncStatus === "failed" ? 35 : state.currencySettings ? 85 : null}
                  detail={`${state.currencySettings?.lastSyncStatus ?? "No sync recorded"} - ${formatDateTime(state.currencySettings?.lastSyncAt, "not synced")}`}
                />
                <ReadinessMeter
                  label="Translation inventory"
                  score={state.counts.translationEntries ? Math.max(30, 100 - state.counts.staleTranslations * 2) : null}
                  detail={`${state.counts.translationEntries} entries, ${state.counts.staleTranslations} stale/failed.`}
                />
                <ReadinessMeter
                  label="Homepage builder"
                  score={state.counts.homepageSections > 0 ? 90 : null}
                  detail={`${state.counts.homepageSections} homepage sections.`}
                />
                <ReadinessMeter
                  label="Property trust"
                  score={state.counts.homes > 0 ? state.command.healthMatrix.find((area) => area.id === "supply")?.score ?? 70 : null}
                  detail={`${state.counts.homes} property records.`}
                />
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Module readiness matrix</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {state.command.moduleSummaries.map((moduleSummary) => (
                  <Link
                    key={moduleSummary.id}
                    href={moduleSummary.href}
                    className="flex items-start justify-between gap-3 rounded-md border p-4 transition-colors hover:border-foreground/30"
                  >
                    <div>
                      <p className="font-medium">{moduleSummary.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {moduleSummary.openWork} open work items - {moduleSummary.nextAction}
                      </p>
                    </div>
                    <StatusBadge status={moduleSummary.severity} label={moduleSummary.status.replaceAll("_", " ")} />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Security and config diagnostics</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <DiagnosticRow icon={<LockKeyhole className="h-4 w-4" />} label="PayPal secret" detail="Never rendered; server-side env only." status="operational" />
                <DiagnosticRow icon={<ShieldCheck className="h-4 w-4" />} label="Card data" detail="No card number, CVV, or raw card payload storage." status="operational" />
                <DiagnosticRow icon={<Database className="h-4 w-4" />} label="Sensitive documents" detail="Verification stores summaries only, not ID/passport numbers." status="operational" />
                <DiagnosticRow icon={<Settings className="h-4 w-4" />} label="Access codes" detail="Handover stores checklist/readiness only." status="operational" />
                <DiagnosticRow icon={<Globe2 className="h-4 w-4" />} label="Localization" detail={state.localizationSettings ? "Settings record present." : "Foundation state."} status={state.localizationSettings ? "operational" : "foundation"} />
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Control shortcuts</h2>
              <div className="mt-4 grid gap-2">
                {ADMIN_MODULES.map((moduleMeta) => (
                  <Link
                    key={moduleMeta.id}
                    href={moduleMeta.href}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:border-foreground/30"
                  >
                    {moduleMeta.title}
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Audit activity</h2>
              <div className="mt-4">
                <Timeline
                  items={state.command.timeline.slice(0, 8).map((event) => ({
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
        </section>
      </div>
    </ModuleShell>
  );
}

function DiagnosticRow({
  icon,
  label,
  detail,
  status,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="flex gap-2">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
