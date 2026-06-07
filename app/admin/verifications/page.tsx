import Link from "next/link";
import {
  BadgeCheck,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";

import { ActionPanel } from "@/app/components/admin/ActionPanel";
import { DetailDrawer } from "@/app/components/admin/DetailDrawer";
import { EmptyState } from "@/app/components/admin/EmptyState";
import { FilterBar } from "@/app/components/admin/FilterBar";
import { IntelligencePanel } from "@/app/components/admin/IntelligencePanel";
import { KpiCard } from "@/app/components/admin/KpiCard";
import { LinkedRecordCard } from "@/app/components/admin/LinkedRecordCard";
import { ModuleShell } from "@/app/components/admin/ModuleShell";
import { ReadinessMeter } from "@/app/components/admin/ReadinessMeter";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { Timeline } from "@/app/components/admin/Timeline";
import { WorkflowBoard } from "@/app/components/admin/WorkflowBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import {
  VERIFICATION_CATEGORIES,
  VERIFICATION_ENTITY_TYPES,
  VERIFICATION_STATUSES,
  getVerificationOperationsData,
} from "@/app/lib/verificationOperations";
import { verificationSeverity } from "@/app/lib/operationsIntelligence";
import { formatCurrencyAmount, formatDateTime } from "@/app/lib/marketplaceStatus";
import {
  createVerificationRecordAction,
  updateVerificationStatusAction,
} from "./actions";

type SearchParams = {
  q?: string | string[];
  entityType?: string | string[];
  category?: string | string[];
  status?: string | string[];
  verificationId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

function readParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

type VerificationData = Awaited<ReturnType<typeof getVerificationOperationsData>>;
type VerificationRecord = VerificationData["records"][number];

function entityHref(entityType: string, entityId: string) {
  if (entityType === "guest") return `/admin/guests?guestId=${entityId}`;
  if (entityType === "partner") return `/admin/partner-operations?q=${entityId}`;
  if (entityType === "property") return `/admin/property-trust?homeId=${entityId}`;
  if (entityType === "payment") return `/admin/payments?paymentId=${entityId}`;
  if (entityType === "handover") return `/admin/handover?taskId=${entityId}`;
  return "/admin/verifications";
}

function ageDays(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function personName(user?: { firstName: string; lastName: string; email: string } | null) {
  if (!user) return "Not resolved";
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

function entitySummary(data: VerificationData, record: VerificationRecord) {
  if (record.entityType === "guest") {
    const user = data.guestsById.get(record.entityId);
    return { title: personName(user), subtitle: user?.email ?? record.entityId, status: user?.role, Icon: UserRound };
  }
  if (record.entityType === "partner") {
    const user = data.partnersById.get(record.entityId);
    return { title: personName(user), subtitle: user?.email ?? record.entityId, status: user?.role, Icon: Users };
  }
  if (record.entityType === "property") {
    const property = data.propertiesById.get(record.entityId);
    return {
      title: property?.approvedTitle ?? property?.title ?? record.entityId,
      subtitle: property?.city,
      status: property?.contentReviewStatus,
      Icon: Home,
    };
  }
  if (record.entityType === "payment") {
    const payment = data.paymentsById.get(record.entityId);
    return {
      title: payment ? formatCurrencyAmount(payment.amount.toString(), payment.currency) : record.entityId,
      subtitle: payment?.providerOrderId,
      status: payment?.status,
      Icon: CreditCard,
    };
  }
  const task = data.handoversById.get(record.entityId);
  return {
    title: task ? `${task.taskNumber}: ${task.title}` : record.entityId,
    subtitle: task ? `Priority: ${task.priority}` : undefined,
    status: task?.status,
    Icon: KeyRound,
  };
}

function linkedDisputes(data: VerificationData, record: VerificationRecord) {
  return data.disputes.filter((dispute) => {
    if (record.entityType === "guest") return dispute.guestId === record.entityId;
    if (record.entityType === "partner") return dispute.partnerId === record.entityId;
    if (record.entityType === "property") return dispute.propertyId === record.entityId;
    if (record.entityType === "payment") return dispute.paymentRecordId === record.entityId;
    return false;
  });
}

function disabledReason(current: string, next: string) {
  if (current === next) return "Verification is already in this status.";
  if (current === "verified" && next === "under_review") return "Verified records should be reopened to pending first.";
  if (current === "rejected" && next === "verified") return "Rejected records should be reopened before verification.";
  return null;
}

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  const data = await getVerificationOperationsData({
    q: readParam(searchParams, "q"),
    entityType: readParam(searchParams, "entityType"),
    category: readParam(searchParams, "category"),
    status: readParam(searchParams, "status"),
  });
  const selectedId = readParam(searchParams, "verificationId") ?? data.records[0]?.id;
  const selected = data.records.find((record) => record.id === selectedId) ?? data.records[0] ?? null;
  const staleRecords = data.records.filter((record) =>
    ["pending", "under_review", "needs_information"].includes(record.status) && ageDays(record.createdAt) >= 7
  );
  const missingEvidence = data.records.filter((record) => !record.evidenceSummary);
  const selectedDisputes = selected ? linkedDisputes(data, selected) : [];
  const selectedEntity = selected ? entitySummary(data, selected) : null;

  return (
    <ModuleShell
      title="Verifications"
      description="Trust, compliance, identity, ownership, property quality, payment risk, premium guest, and operational readiness verification queue with evidence summaries only."
      moduleStatus={staleRecords.length || missingEvidence.length ? "requires_review" : "operational"}
      statusLabel={`${data.records.length} records`}
      notice={readParam(searchParams, "notice")}
      error={readParam(searchParams, "error")}
      layout="split"
      intelligence={
        <IntelligencePanel
          title="Trust and compliance intelligence"
          readiness={[
            {
              label: "Queue freshness",
              score: data.records.length ? Math.max(25, 100 - staleRecords.length * 20) : null,
              detail: `${staleRecords.length} active records older than 7 days.`,
            },
            {
              label: "Evidence summary coverage",
              score: data.records.length ? Math.round(((data.records.length - missingEvidence.length) / data.records.length) * 100) : null,
              detail: `${missingEvidence.length} records need evidence summaries.`,
            },
          ]}
          blockers={[
            ...staleRecords.slice(0, 4).map((record) => ({
              id: `stale-${record.id}`,
              title: "Pending too long",
              description: `${record.title} has been pending ${ageDays(record.createdAt)} days.`,
              severity: verificationSeverity(record.status, ageDays(record.createdAt)),
              href: `/admin/verifications?verificationId=${record.id}`,
              actionLabel: "Open record",
            })),
            ...missingEvidence.slice(0, 4).map((record) => ({
              id: `evidence-${record.id}`,
              title: "Evidence summary missing",
              description: `${record.title} has no evidence summary. Do not store sensitive IDs or raw docs.`,
              severity: "medium" as const,
              href: `/admin/verifications?verificationId=${record.id}`,
              actionLabel: "Open record",
            })),
          ]}
          suggestions={[
            {
              id: "sensitive_data",
              title: "Evidence summaries only",
              description: "Do not store passport numbers, ID numbers, raw document files, or sensitive document contents.",
              severity: "info",
            },
            {
              id: "linked_dispute",
              title: "Check linked disputes",
              description: selectedDisputes.length ? "Selected entity has dispute exposure." : "No linked disputes for selected entity.",
              severity: selectedDisputes.length ? "high" : "low",
            },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-5">
          <KpiCard label="Pending" value={data.countByStatus.pending ?? 0} href="/admin/verifications?status=pending" tone="warning" />
          <KpiCard label="Under review" value={data.countByStatus.under_review ?? 0} href="/admin/verifications?status=under_review" />
          <KpiCard label="Verified" value={data.countByStatus.verified ?? 0} href="/admin/verifications?status=verified" tone="success" />
          <KpiCard label="Needs information" value={data.countByStatus.needs_information ?? 0} href="/admin/verifications?status=needs_information" tone="warning" />
          <KpiCard label="Missing evidence" value={missingEvidence.length} tone={missingEvidence.length ? "warning" : "success"} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <div className="rounded-md border bg-background p-4 shadow-sm">
              <h2 className="font-semibold">Entity filter matrix</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {VERIFICATION_ENTITY_TYPES.map((entityType) => (
                  <Link
                    key={entityType}
                    href={`/admin/verifications?entityType=${entityType}`}
                    className="rounded-md border px-3 py-2 text-sm font-medium hover:border-foreground/30"
                  >
                    {entityType}
                  </Link>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-background p-4 shadow-sm">
              <h2 className="font-semibold">Category matrix</h2>
              <div className="mt-3 grid gap-2">
                {VERIFICATION_CATEGORIES.map((category) => (
                  <Link
                    key={category}
                    href={`/admin/verifications?category=${category}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:border-foreground/30"
                  >
                    {category.replaceAll("_", " ")}
                    <StatusBadge status={category} label={String(data.countByCategory[category] ?? 0)} />
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-5">
            <section className="rounded-md border bg-background p-4 shadow-sm">
              <FilterBar
                action="/admin/verifications"
                query={readParam(searchParams, "q")}
                queryPlaceholder="Search title, entity id, summary"
                selects={[
                  {
                    name: "entityType",
                    label: "Entity type",
                    value: readParam(searchParams, "entityType"),
                    options: [{ value: "", label: "Any entity" }, ...VERIFICATION_ENTITY_TYPES.map((type) => ({ value: type, label: type }))],
                  },
                  {
                    name: "category",
                    label: "Category",
                    value: readParam(searchParams, "category"),
                    options: [{ value: "", label: "Any category" }, ...VERIFICATION_CATEGORIES.map((category) => ({ value: category, label: category.replaceAll("_", " ") }))],
                  },
                  {
                    name: "status",
                    label: "Status",
                    value: readParam(searchParams, "status"),
                    options: [{ value: "", label: "Any status" }, ...VERIFICATION_STATUSES.map((status) => ({ value: status, label: status.replaceAll("_", " ") }))],
                  },
                ]}
              />
            </section>

            <WorkflowBoard
              columns={VERIFICATION_STATUSES.map((status) => ({
                id: status,
                title: status.replaceAll("_", " "),
                status,
                records: data.records.filter((record) => record.status === status),
                empty: `No ${status.replaceAll("_", " ")} verification records.`,
              }))}
              hrefForRecord={(record) => `/admin/verifications?verificationId=${record.id}`}
              renderCard={(record) => {
                const entity = entitySummary(data, record);
                const severity = verificationSeverity(record.status, ageDays(record.createdAt));
                return (
                  <div className="rounded-md border bg-background p-3 transition-colors hover:border-foreground/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{record.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{entity.title}</p>
                      </div>
                      <StatusBadge status={severity} label={severity} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{record.entityType}</span>
                      <span>{record.category.replaceAll("_", " ")}</span>
                      {!record.evidenceSummary ? <span>missing evidence</span> : null}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        </section>

        <section className="rounded-md border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create verification record</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Store only operational summaries and evidence summaries. Do not enter passport
            numbers, ID numbers, raw document files, or sensitive document contents.
          </p>
          <form action={createVerificationRecordAction} className="mt-4 grid gap-3 md:grid-cols-3">
            <select name="entityType" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
              {VERIFICATION_ENTITY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Input name="entityId" placeholder="Entity id" required />
            <select name="category" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
              {VERIFICATION_CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}
            </select>
            <Input name="title" placeholder="Verification title" required className="md:col-span-3" />
            <Textarea name="summary" placeholder="Operational summary" rows={2} className="md:col-span-3" />
            <Textarea name="evidenceSummary" placeholder="Evidence summary only; no sensitive numbers or document contents" rows={3} className="md:col-span-3" />
            <Button type="submit" className="md:col-span-3">Create verification</Button>
          </form>
        </section>

        {data.records.length === 0 ? (
          <EmptyState
            title="No verification records found"
            description="Verification records appear when real guest, partner, property, payment, or handover entities need trust/risk review."
            why="The current query returned no VerificationRecord rows."
            createsRecords="Create records from this page or from Bookings, Guests, Partner Operations, Premium Guests, Handover, or Payments."
            checklist={[
              "Choose entity type and real entity id.",
              "Use evidence summaries only.",
              "Move through review, information request, verification, rejection, expiry, or reopen lifecycle.",
            ]}
            links={[
              { href: "/admin/guests", label: "Open guests" },
              { href: "/admin/partner-operations", label: "Open partners" },
            ]}
          />
        ) : null}

        {selected && selectedEntity ? (
          <DetailDrawer
            title={selected.title}
            subtitle={`${selected.entityType} / ${selected.entityId} - Created ${formatDateTime(selected.createdAt)}`}
            tabs={[
              {
                id: "overview",
                label: "Overview",
                content: (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selected.status} />
                      <StatusBadge status={selected.category} label={selected.category.replaceAll("_", " ")} />
                      <StatusBadge status={selected.entityType} label={selected.entityType} />
                      <StatusBadge status={verificationSeverity(selected.status, ageDays(selected.createdAt))} label={`Risk: ${verificationSeverity(selected.status, ageDays(selected.createdAt))}`} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Metric label="Reviewed by" value={selected.reviewedById ?? "Not reviewed"} />
                      <Metric label="Reviewed at" value={formatDateTime(selected.reviewedAt, "Not reviewed")} />
                      <Metric label="Expires at" value={formatDateTime(selected.expiresAt, "No expiry")} />
                    </div>
                    <ReadinessMeter
                      label="Verification readiness"
                      score={selected.status === "verified" ? 100 : selected.evidenceSummary ? 65 : 35}
                      detail={selected.evidenceSummary ? "Evidence summary present." : "Evidence summary missing."}
                    />
                  </div>
                ),
              },
              {
                id: "entity",
                label: "Entity",
                content: (
                  <LinkedRecordCard
                    type={`${selected.entityType} entity`}
                    title={selectedEntity.title}
                    subtitle={selectedEntity.subtitle}
                    status={selectedEntity.status}
                    href={entityHref(selected.entityType, selected.entityId)}
                    Icon={selectedEntity.Icon}
                  />
                ),
              },
              {
                id: "evidence",
                label: "Evidence Summary",
                content: (
                  <div className="space-y-4">
                    <div className="rounded-md border p-4">
                      <h3 className="font-medium">Operational summary</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selected.summary ?? "No operational summary provided."}
                      </p>
                    </div>
                    <div className="rounded-md border p-4">
                      <h3 className="font-medium">Evidence summary</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selected.evidenceSummary ?? "No evidence summary recorded."}
                      </p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Sensitive IDs, passport numbers, raw document files, and private document
                      contents are intentionally not stored in this verification record.
                    </div>
                  </div>
                ),
              },
              {
                id: "risk",
                label: "Risk",
                badge: selectedDisputes.length,
                content: (
                  <div className="grid gap-3">
                    {selectedDisputes.length ? selectedDisputes.map((dispute) => (
                      <LinkedRecordCard
                        key={dispute.id}
                        type="Linked dispute"
                        title={`${dispute.caseNumber}: ${dispute.title}`}
                        subtitle={`Priority: ${dispute.priority}`}
                        status={dispute.status}
                        href={`/admin/disputes?disputeId=${dispute.id}`}
                        Icon={ShieldAlert}
                      />
                    )) : (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        No linked disputes found for this entity.
                      </div>
                    )}
                    <LinkedRecordCard
                      type="Risk note"
                      title={selected.evidenceSummary ? "Evidence summary present" : "Evidence summary missing"}
                      subtitle={selected.evidenceSummary ? "Reviewer can continue lifecycle review." : "Request information or record a non-sensitive summary before final decision."}
                      status={selected.evidenceSummary ? "operational" : "requires_review"}
                      Icon={FileText}
                    />
                  </div>
                ),
              },
              {
                id: "timeline",
                label: "Timeline",
                badge: selected.events.length,
                content: (
                  <Timeline
                    items={selected.events.map((event) => ({
                      id: event.id,
                      type: event.type,
                      summary: event.message,
                      createdAt: event.createdAt,
                      actor: event.createdById,
                      payloadPreview: event.payload ? JSON.stringify(event.payload, null, 2) : null,
                    }))}
                  />
                ),
              },
              {
                id: "actions",
                label: "Actions",
                content: (
                  <ActionPanel
                    title="Verification actions"
                    description="Lifecycle mutations are admin-only, validated, audited, and never store sensitive document values."
                    result={readParam(searchParams, "notice") ?? readParam(searchParams, "error")}
                  >
                    {[
                      ["under_review", "Start review"],
                      ["needs_information", "Request information"],
                      ["verified", "Verify"],
                      ["rejected", "Reject"],
                      ["expired", "Expire"],
                      ["pending", "Reopen"],
                    ].map(([status, label]) => {
                      const reason = disabledReason(selected.status, status);
                      return (
                        <form key={status} action={updateVerificationStatusAction} className="space-y-2 rounded-md border p-3">
                          <input type="hidden" name="verificationId" value={selected.id} />
                          <input type="hidden" name="status" value={status} />
                          <Textarea name="message" rows={2} placeholder="Timeline message" />
                          <Button
                            type="submit"
                            variant={status === "rejected" ? "destructive" : "outline"}
                            className="w-full"
                            disabled={Boolean(reason)}
                          >
                            {label}
                          </Button>
                          {reason ? <p className="text-xs text-muted-foreground">{reason}</p> : null}
                        </form>
                      );
                    })}
                  </ActionPanel>
                ),
              },
              {
                id: "audit",
                label: "Audit",
                content: (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    Verification actions write both VerificationEvent rows and centralized admin
                    audit events. Sensitive identity numbers and raw documents are intentionally
                    outside this schema.
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </ModuleShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}
