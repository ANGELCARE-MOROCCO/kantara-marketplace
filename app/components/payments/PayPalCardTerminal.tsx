"use client";

import type { ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  BadgeCheck,
  CreditCard,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from "lucide-react";

type PayPalCardTerminalProps = {
  environment: string;
  status: string;
  isConfigured: boolean;
  hasPublicClientId: boolean;
  hasWebhookId: boolean;
  approvalUrl?: string | null;
};

export function PayPalCardTerminal({
  environment,
  status,
  isConfigured,
  hasPublicClientId,
  hasWebhookId,
  approvalUrl,
}: PayPalCardTerminalProps) {
  const readinessScore = [isConfigured, hasPublicClientId, hasWebhookId].filter(Boolean).length;
  const readyLabel = isConfigured ? "Provider actions enabled" : "Provider actions blocked";

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/10">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Provider terminal</p>
              <h2 className="mt-1 text-xl font-semibold">PayPal payment terminal</h2>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-300">
                Hosted PayPal checkout handles approval and card entry. Kantara records provider IDs, statuses, and operational events only.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/10 px-4 py-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Readiness</p>
            <p className="mt-1 text-lg font-semibold">{readinessScore}/3 checks</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
        <TerminalMetric icon={<Activity className="h-4 w-4" />} label="Environment" value={environment} ok={environment !== "not configured"} />
        <TerminalMetric icon={<BadgeCheck className="h-4 w-4" />} label="Provider status" value={status.replaceAll("_", " ")} ok={isConfigured} />
        <TerminalMetric
          icon={<KeyRound className="h-4 w-4" />}
          label="Server credentials"
          value={isConfigured ? "Configured" : "Missing"}
          ok={isConfigured}
        />
        <TerminalMetric
          icon={<CreditCard className="h-4 w-4" />}
          label="Public client ID"
          value={hasPublicClientId ? "Available" : "Not configured"}
          ok={hasPublicClientId}
        />
        <TerminalMetric
          icon={<Radio className="h-4 w-4" />}
          label="Webhook ID"
          value={hasWebhookId ? "Configured" : "Optional / missing"}
          ok={hasWebhookId}
        />
        <TerminalMetric
          icon={<LockKeyhole className="h-4 w-4" />}
          label="Card fields"
          value={
            hasPublicClientId
              ? "Unknown until runtime"
              : "Use PayPal checkout"
          }
          ok={hasPublicClientId}
        />
      </div>

      {!isConfigured ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-950">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              PayPal server credentials are required before this terminal can create PayPal orders.
            </p>
          </div>
        </div>
      ) : null}

      {!hasPublicClientId ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-5 text-slate-600">
          PayPal card fields are not available for this account/environment. Use PayPal checkout or complete PayPal advanced card setup.
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-5 text-emerald-950">
          Card fields eligibility is detected by the PayPal SDK at checkout runtime. PayPal checkout remains the safe fallback.
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {approvalUrl ? (
          <a
            href={approvalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Open PayPal approval
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
        <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
          <ShieldCheck className="h-4 w-4" />
          No raw card data stored
        </span>
        <span className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          {readyLabel}
        </span>
      </div>
      </div>
    </div>
  );
}

function TerminalMetric({
  icon,
  label,
  value,
  ok,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          {icon}
          {label}
        </p>
        <span className={ok ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-amber-500"} />
      </div>
      <p className="mt-2 font-semibold capitalize text-slate-950">{value}</p>
    </div>
  );
}
