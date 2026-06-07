import { cn } from "@/lib/utils";

type RiskBadgeProps = {
  severity?: "critical" | "high" | "medium" | "low" | "info" | string | null;
  label?: string;
};

export function RiskBadge({ severity = "low", label }: RiskBadgeProps) {
  const normalized = severity ?? "low";
  const classes =
    normalized === "critical" || normalized === "urgent"
      ? "border-red-300 bg-red-100 text-red-900"
      : normalized === "high"
        ? "border-red-200 bg-red-50 text-red-800"
        : normalized === "medium" || normalized === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : normalized === "info"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", classes)}>
      {label ?? normalized.replaceAll("_", " ")}
    </span>
  );
}
