import { cn } from "@/lib/utils";
import { getStatusTone, getStatusText } from "@/app/lib/marketplaceStatus";

type StatusBadgeProps = {
  status?: string | null;
  label?: string | null;
  className?: string;
};

const toneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tone = getStatusTone(status);

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {label ?? getStatusText(status)}
    </span>
  );
}
