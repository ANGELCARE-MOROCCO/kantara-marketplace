import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type KpiCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

const toneClass = {
  default: "border-slate-200 bg-white",
  success: "border-emerald-200 bg-emerald-50/70",
  warning: "border-amber-200 bg-amber-50/70",
  danger: "border-red-200 bg-red-50/70",
  info: "border-blue-200 bg-blue-50/70",
};

export function KpiCard({
  label,
  value,
  detail,
  href,
  tone = "default",
}: KpiCardProps) {
  const content = (
    <div
      className={cn(
        "rounded-lg border p-4 shadow-sm transition-colors",
        href ? "hover:border-slate-400 hover:shadow-md" : "",
        toneClass[tone]
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-slate-600">{detail}</div> : null}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
