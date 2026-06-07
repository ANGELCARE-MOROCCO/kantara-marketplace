import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type ProviderStatusProps = {
  provider: string;
  environment?: string | null;
  status: string;
  details: { label: string; ok: boolean; value: string }[];
};

export function ProviderStatus({
  provider,
  environment,
  status,
  details,
}: ProviderStatusProps) {
  const ready = details.every((detail) => detail.ok);
  const readyCount = details.filter((detail) => detail.ok).length;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Provider health</p>
          <h2 className="mt-1 text-lg font-semibold">{provider}</h2>
          {environment ? <p className="text-sm text-slate-300">{environment}</p> : null}
        </div>
        <StatusBadge status={status} className="border-white/10 bg-white/10 text-white" />
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/10">
          <div
            className={ready ? "h-2 rounded-full bg-emerald-400" : "h-2 rounded-full bg-amber-400"}
            style={{ width: `${Math.max(12, Math.round((readyCount / Math.max(details.length, 1)) * 100))}%` }}
          />
        </div>
      </div>
      <div className="grid gap-2 p-4">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              {detail.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-700" />
              )}
              {detail.label}
            </span>
            <span className="text-right font-semibold text-slate-900">{detail.value}</span>
          </div>
        ))}
        <div className={ready ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950" : "rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"}>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {ready
                ? "Provider is ready for operational workflows."
                : "Provider setup is incomplete. Actions explain disabled reasons instead of attempting unsafe calls."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
