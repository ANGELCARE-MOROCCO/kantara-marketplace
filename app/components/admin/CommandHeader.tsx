import type { ReactNode } from "react";
import { Activity, Clock } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type CommandHeaderProps = {
  title: string;
  eyebrow?: string;
  description: string;
  status?: string | null;
  statusLabel?: string | null;
  lastActivity?: string | null;
  environment?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
};

export function CommandHeader({
  title,
  eyebrow = "Kantara Command Center",
  description,
  status,
  statusLabel,
  lastActivity,
  environment,
  primaryAction,
  secondaryActions,
}: CommandHeaderProps) {
  return (
    <header className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {status || statusLabel ? <StatusBadge status={status} label={statusLabel} className="border-white/10 bg-white/10 text-white" /> : null}
            {environment ? (
              <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 font-medium text-slate-100">
                <Activity className="h-3.5 w-3.5" />
                {environment}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
            {lastActivity ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                <Clock className="h-3.5 w-3.5" />
                Last activity: {lastActivity}
              </span>
            ) : null}
          </div>
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
    </header>
  );
}
