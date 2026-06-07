import Link from "next/link";
import {
  CalendarCheck,
  CreditCard,
  ShieldAlert,
  Sparkles,
  UserRound,
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
import { Textarea } from "@/components/ui/textarea";
import { requireAdmin } from "@/app/lib/auth";
import {
  PREMIUM_GUEST_RISK_LEVELS,
  PREMIUM_GUEST_STATUSES,
  calculatePremiumEligibilityScore,
  getPremiumGuestOperationsData,
} from "@/app/lib/premiumGuestOperations";
import { formatCurrencyAmount, formatDate, formatDateTime } from "@/app/lib/marketplaceStatus";
import {
  createPremiumGuestProfileAction,
  updatePremiumGuestStatusAction,
} from "./actions";
import { createVerificationRecordAction } from "../verifications/actions";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  riskLevel?: string | string[];
  profileId?: string | string[];
  notice?: string | string[];
  error?: string | string[];
};

function readParam(searchParams: SearchParams | undefined, key: keyof SearchParams) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function userName(user?: { firstName: string; lastName: string; email: string } | null) {
  if (!user) return "Guest unavailable";
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

type PremiumData = Awaited<ReturnType<typeof getPremiumGuestOperationsData>>;
type PremiumProfile = PremiumData["profiles"][number];

function computedScore(data: PremiumData, profile: PremiumProfile) {
  const user = data.userById.get(profile.userId);
  const verification = data.verificationByGuestId.get(profile.userId)?.[0];
  return calculatePremiumEligibilityScore({
    reservationCount: user?._count.Reservation ?? 0,
    favoriteCount: user?._count.Favorite ?? 0,
    verificationStatus: verification?.status,
    disputeCount: data.disputeCountByGuestId.get(profile.userId) ?? 0,
    riskLevel: profile.riskLevel,
  });
}

function lifecycleDisabledReason(current: string, next: string) {
  if (current === next) return "Profile is already in this status.";
  if (current === "rejected" && next === "premium_ready") return "Rejected profiles must be reopened before premium readiness.";
  if (current === "suspended" && next === "premium_ready") return "Suspended profiles must be reviewed before premium readiness.";
  return null;
}

export default async function PremiumGuestsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  const data = await getPremiumGuestOperationsData({
    q: readParam(searchParams, "q"),
    status: readParam(searchParams, "status"),
    riskLevel: readParam(searchParams, "riskLevel"),
  });
  const selectedId = readParam(searchParams, "profileId") ?? data.profiles[0]?.id;
  const selected = data.profiles.find((profile) => profile.id === selectedId) ?? data.profiles[0] ?? null;
  const selectedUser = selected ? data.userById.get(selected.userId) : null;
  const highRisk = data.profiles.filter((profile) => profile.riskLevel === "high");
  const underReview = data.profiles.filter((profile) => ["candidate", "under_review", "verified"].includes(profile.status));
  const premiumReady = data.profiles.filter((profile) => profile.status === "premium_ready");

  return (
    <ModuleShell
      title="Premium Guests"
      description="Verified traveler operations based on real guest accounts, reservation history, verification status, payment history, dispute exposure, risk level, and internal eligibility. This is not a paid subscription module."
      moduleStatus={underReview.length ? "requires_review" : "operational"}
      statusLabel={`${underReview.length} pipeline profiles`}
      notice={readParam(searchParams, "notice")}
      error={readParam(searchParams, "error")}
      layout="split"
      intelligence={
        <IntelligencePanel
          title="Eligibility intelligence"
          readiness={[
            {
              label: "Pipeline readiness",
              score: data.profiles.length ? Math.max(25, 100 - underReview.length * 8 - highRisk.length * 18) : null,
              detail: `${underReview.length} active review profiles and ${highRisk.length} high-risk profiles.`,
            },
            {
              label: "Premium-ready coverage",
              score: data.profiles.length ? Math.round((premiumReady.length / data.profiles.length) * 100) : null,
              detail: `${premiumReady.length} profiles are premium ready.`,
            },
          ]}
          blockers={highRisk.slice(0, 5).map((profile) => {
            const user = data.userById.get(profile.userId);
            return {
              id: profile.id,
              title: "High-risk premium profile",
              description: `${userName(user)} is marked high risk and needs review before readiness.`,
              severity: "high" as const,
              href: `/admin/premium-guests?profileId=${profile.id}`,
              actionLabel: "Open profile",
            };
          })}
          suggestions={[
            {
              id: "verification",
              title: "Verify before premium readiness",
              description: "Premium-ready decisions should have a verified or active guest verification record.",
              severity: selected && data.verificationByGuestId.get(selected.userId)?.[0]?.status === "verified" ? "low" : "medium",
            },
            {
              id: "honest_foundation",
              title: "No paid benefits are active",
              description: "This module tracks eligibility and readiness only; it does not create subscription or concierge privileges.",
              severity: "info",
            },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-5">
          <KpiCard label="Candidates" value={data.countByStatus.candidate ?? 0} href="/admin/premium-guests?status=candidate" />
          <KpiCard label="Under review" value={data.countByStatus.under_review ?? 0} href="/admin/premium-guests?status=under_review" tone="warning" />
          <KpiCard label="Verified" value={data.countByStatus.verified ?? 0} href="/admin/premium-guests?status=verified" tone="success" />
          <KpiCard label="Premium ready" value={data.countByStatus.premium_ready ?? 0} href="/admin/premium-guests?status=premium_ready" tone="success" />
          <KpiCard label="Discovery candidates" value={data.candidateUsers.length} detail="Real accounts without profiles" />
        </section>

        <section className="rounded-md border bg-background p-4 shadow-sm">
          <FilterBar
            action="/admin/premium-guests"
            query={readParam(searchParams, "q")}
            queryPlaceholder="Search guest name or email"
            selects={[
              {
                name: "status",
                label: "Status",
                value: readParam(searchParams, "status"),
                options: [{ value: "", label: "Any status" }, ...PREMIUM_GUEST_STATUSES.map((status) => ({ value: status, label: status.replaceAll("_", " ") }))],
              },
              {
                name: "riskLevel",
                label: "Risk",
                value: readParam(searchParams, "riskLevel"),
                options: [{ value: "", label: "Any risk" }, ...PREMIUM_GUEST_RISK_LEVELS.map((risk) => ({ value: risk, label: risk }))],
              },
            ]}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <WorkflowBoard
              columns={PREMIUM_GUEST_STATUSES.map((status) => ({
                id: status,
                title: status.replaceAll("_", " "),
                status,
                records: data.profiles.filter((profile) => profile.status === status),
                empty: `No ${status.replaceAll("_", " ")} profiles.`,
              }))}
              hrefForRecord={(profile) => `/admin/premium-guests?profileId=${profile.id}`}
              renderCard={(profile) => {
                const user = data.userById.get(profile.userId);
                const disputes = data.disputeCountByGuestId.get(profile.userId) ?? 0;
                return (
                  <div className="rounded-md border bg-background p-3 transition-colors hover:border-foreground/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{userName(user)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{user?.email ?? profile.userId}</p>
                      </div>
                      <StatusBadge status={profile.riskLevel} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{computedScore(data, profile)}/100</span>
                      <span>{user?._count.Reservation ?? 0} stays</span>
                      <span>{disputes} disputes</span>
                    </div>
                  </div>
                );
              }}
            />

            <section className="rounded-md border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Candidate discovery</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These are real non-admin accounts without a premium profile. Creating a profile
                starts internal review only.
              </p>
              <div className="mt-4 divide-y rounded-md border">
                {data.candidateUsers.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="No candidate accounts found"
                      description="All matching guests already have profiles or no guest accounts match the filter."
                      why="Candidate discovery uses real User rows with no PremiumGuestProfile."
                      createsRecords="Create profiles from real users only."
                    />
                  </div>
                ) : (
                  data.candidateUsers.slice(0, 12).map((user) => {
                    const candidateScore = calculatePremiumEligibilityScore({
                      reservationCount: user._count.Reservation,
                      favoriteCount: user._count.Favorite,
                      disputeCount: 0,
                      riskLevel: "low",
                    });
                    return (
                      <form key={user.id} action={createPremiumGuestProfileAction} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_120px_220px] lg:items-center">
                        <input type="hidden" name="userId" value={user.id} />
                        <div>
                          <p className="font-medium">{userName(user)}</p>
                          <p className="text-sm text-muted-foreground">
                            {user.email} - {user._count.Reservation} reservations - {user._count.Favorite} saved homes
                          </p>
                        </div>
                        <ReadinessMeter label="Initial score" score={candidateScore} size="compact" />
                        <div className="flex gap-2">
                          <select name="riskLevel" defaultValue="low" className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                            {PREMIUM_GUEST_RISK_LEVELS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
                          </select>
                          <Button type="submit" variant="outline">Create profile</Button>
                        </div>
                      </form>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <aside className="rounded-md border bg-background p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Premium foundation</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                Premium Guests tracks verified traveler readiness for operations teams. It does
                not create paid plans, subscription state, fabricated concierge benefits, or
                public-facing privileges.
              </p>
              <p>
                Eligibility is derived from account completeness, reservation history,
                verification status, dispute exposure, payment context, risk level, language and
                currency preferences, and internal notes.
              </p>
            </div>
          </aside>
        </section>

        {data.profiles.length === 0 ? (
          <EmptyState
            title="No premium guest profiles yet"
            description="Create a profile from a real guest account to begin verified traveler review."
            why="No PremiumGuestProfile rows exist for the current filters."
            createsRecords="Candidate discovery creates profile records from real users."
            checklist={[
              "Choose a real guest account.",
              "Set initial risk level.",
              "Create verification before premium-ready status when needed.",
            ]}
            links={[{ href: "/admin/guests", label: "Open guests" }]}
          />
        ) : null}

        {selected ? (
          <DetailDrawer
            title={userName(selectedUser)}
            subtitle={`${selectedUser?.email ?? selected.userId} - Created ${formatDateTime(selected.createdAt)}`}
            tabs={[
              {
                id: "profile",
                label: "Profile",
                content: (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={selected.status} />
                      <StatusBadge status={selected.riskLevel} label={`Risk: ${selected.riskLevel}`} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Metric label="Stored score" value={`${selected.eligibilityScore}/100`} />
                      <Metric label="Computed score" value={`${computedScore(data, selected)}/100`} />
                      <Metric label="Reviewed at" value={formatDateTime(selected.reviewedAt, "Not reviewed")} />
                      <Metric label="Preferred currency" value={selected.preferredCurrency ?? "Not set"} />
                      <Metric label="Preferred language" value={selected.preferredLanguage ?? "Not set"} />
                      <Metric label="Travel style" value={selected.travelStyle ?? "Not set"} />
                    </div>
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      {selected.notes ?? "No internal notes recorded."}
                    </div>
                  </div>
                ),
              },
              {
                id: "eligibility",
                label: "Eligibility",
                content: (
                  <div className="grid gap-3">
                    <ReadinessMeter
                      label="Eligibility score"
                      score={computedScore(data, selected)}
                      detail="Computed from real reservation, favorite, verification, dispute, and risk signals."
                    />
                    <ChecklistItem label="Account completeness" detail="Uses existing user profile fields; no unsafe account editing from this page." status={selectedUser ? "operational" : "requires_review"} />
                    <ChecklistItem label="Reservation history" detail={`${selectedUser?._count.Reservation ?? 0} linked reservations.`} status={(selectedUser?._count.Reservation ?? 0) > 0 ? "operational" : "foundation"} />
                    <ChecklistItem label="Verification status" detail={data.verificationByGuestId.get(selected.userId)?.[0]?.status ?? "No guest verification record."} status={data.verificationByGuestId.get(selected.userId)?.[0]?.status ?? "requires_review"} />
                    <ChecklistItem label="Dispute history" detail={`${data.disputeCountByGuestId.get(selected.userId) ?? 0} linked disputes.`} status={(data.disputeCountByGuestId.get(selected.userId) ?? 0) ? "requires_review" : "operational"} />
                    <ChecklistItem label="Future concierge readiness" detail="Prepared foundation only; no active benefits or paid plan." status="foundation" />
                  </div>
                ),
              },
              {
                id: "reservations",
                label: "Reservations",
                badge: data.reservationsByGuestId.get(selected.userId)?.length ?? 0,
                content: (
                  <div className="grid gap-3">
                    {(data.reservationsByGuestId.get(selected.userId) ?? []).length ? (
                      (data.reservationsByGuestId.get(selected.userId) ?? []).map((reservation) => (
                        <LinkedRecordCard
                          key={reservation.id}
                          type="Reservation"
                          title={reservation.listingTitleSnapshot ?? reservation.id}
                          subtitle={formatDate(reservation.startDate)}
                          status={reservation.bookingStatus}
                          href={`/admin/bookings?reservationId=${reservation.id}`}
                          Icon={CalendarCheck}
                        />
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        No reservations linked to this guest.
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "verification",
                label: "Verification",
                badge: data.verificationByGuestId.get(selected.userId)?.length ?? 0,
                content: (
                  <div className="space-y-4">
                    <div className="grid gap-3">
                      {(data.verificationByGuestId.get(selected.userId) ?? []).map((record) => (
                        <LinkedRecordCard
                          key={record.id}
                          type="Verification"
                          title={record.title}
                          subtitle={record.category.replaceAll("_", " ")}
                          status={record.status}
                          href={`/admin/verifications?verificationId=${record.id}`}
                          Icon={ShieldAlert}
                        />
                      ))}
                    </div>
                    <form action={createVerificationRecordAction} className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
                      <input type="hidden" name="entityType" value="guest" />
                      <input type="hidden" name="entityId" value={selected.userId} />
                      <input type="hidden" name="category" value="premium_guest" />
                      <input type="hidden" name="title" value={`Premium guest review for ${userName(selectedUser)}`} />
                      <Textarea name="summary" rows={2} placeholder="Operational summary" />
                      <Textarea name="evidenceSummary" rows={2} placeholder="Evidence summary only; no sensitive ID numbers." />
                      <Button type="submit" variant="outline" className="md:col-span-2">Create premium guest verification</Button>
                    </form>
                  </div>
                ),
              },
              {
                id: "payments",
                label: "Payments",
                badge: data.paymentsByGuestId.get(selected.userId)?.length ?? 0,
                content: (
                  <div className="grid gap-3">
                    {(data.paymentsByGuestId.get(selected.userId) ?? []).map((payment) => (
                      <LinkedRecordCard
                        key={payment.id}
                        type="Payment"
                        title={formatCurrencyAmount(payment.amount.toString(), payment.currency)}
                        subtitle={payment.providerOrderId ?? payment.method.replaceAll("_", " ")}
                        status={payment.status}
                        href={`/admin/payments?paymentId=${payment.id}`}
                        Icon={CreditCard}
                      />
                    ))}
                    {(data.paymentsByGuestId.get(selected.userId) ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        No payment records linked to this guest.
                      </div>
                    ) : null}
                  </div>
                ),
              },
              {
                id: "disputes",
                label: "Disputes",
                badge: data.disputeCountByGuestId.get(selected.userId) ?? 0,
                content: (
                  <LinkedRecordCard
                    type="Dispute exposure"
                    title={`${data.disputeCountByGuestId.get(selected.userId) ?? 0} linked disputes`}
                    subtitle="Open the disputes module for full case history."
                    status={(data.disputeCountByGuestId.get(selected.userId) ?? 0) ? "requires_review" : "operational"}
                    href={`/admin/disputes?q=${selected.userId}`}
                    Icon={ShieldAlert}
                  />
                ),
              },
              {
                id: "preferences",
                label: "Preferences",
                content: (
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Preferred currency" value={selected.preferredCurrency ?? "Not set"} />
                    <Metric label="Preferred language" value={selected.preferredLanguage ?? "Not set"} />
                    <Metric label="Travel style" value={selected.travelStyle ?? "Not set"} />
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
                    title="Premium guest lifecycle"
                    description="Lifecycle actions are internal eligibility states only. They do not create subscriptions, payments, or concierge benefits."
                    result={readParam(searchParams, "notice") ?? readParam(searchParams, "error")}
                  >
                    {[
                      ["candidate", "Mark candidate"],
                      ["under_review", "Start review"],
                      ["verified", "Verify"],
                      ["premium_ready", "Mark premium ready"],
                      ["suspended", "Suspend"],
                      ["rejected", "Reject"],
                    ].map(([status, label]) => {
                      const reason = lifecycleDisabledReason(selected.status, status);
                      return (
                        <form key={status} action={updatePremiumGuestStatusAction} className="space-y-2 rounded-md border p-3">
                          <input type="hidden" name="profileId" value={selected.id} />
                          <input type="hidden" name="status" value={status} />
                          <Textarea name="note" rows={2} placeholder="Internal note" />
                          <Button
                            type="submit"
                            variant={["suspended", "rejected"].includes(status) ? "destructive" : "outline"}
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
            ]}
          />
        ) : null}
      </div>
    </ModuleShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function ChecklistItem({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
