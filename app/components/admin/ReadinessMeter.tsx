import { cn } from "@/lib/utils";

type ReadinessMeterProps = {
  label: string;
  score: number | null;
  detail?: string;
  size?: "compact" | "default";
};

export function ReadinessMeter({
  label,
  score,
  detail,
  size = "default",
}: ReadinessMeterProps) {
  const safeScore = score === null ? null : Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    safeScore === null
      ? "bg-slate-300"
      : safeScore >= 80
        ? "bg-emerald-600"
        : safeScore >= 55
          ? "bg-amber-500"
          : "bg-red-600";

  return (
    <div className={cn("rounded-md border bg-background p-4", size === "compact" && "p-3")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <p className="text-sm font-semibold">{safeScore === null ? "Foundation" : `${safeScore}%`}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted">
        <div
          className={cn("h-2 rounded-full", tone)}
          style={{ width: `${safeScore ?? 18}%` }}
        />
      </div>
    </div>
  );
}
