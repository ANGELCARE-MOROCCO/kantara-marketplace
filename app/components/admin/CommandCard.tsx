import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

type CommandCardProps = {
  title: string;
  description: string;
  href: string;
  count?: number | string | null;
  countLabel?: string;
  status?: string | null;
  statusLabel?: string | null;
  lastUpdated?: string | null;
  readiness?: ReactNode;
  Icon?: ComponentType<{ className?: string }>;
};

export function CommandCard({
  title,
  description,
  href,
  count,
  countLabel,
  status,
  statusLabel,
  lastUpdated,
  readiness,
  Icon,
}: CommandCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col rounded-md border bg-background p-5 shadow-sm transition-colors",
        "hover:border-foreground/30 hover:bg-muted/20"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </span>
          ) : null}
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          {count !== undefined && count !== null ? (
            <>
              <p className="text-2xl font-semibold tracking-tight">{count}</p>
              <p className="text-xs text-muted-foreground">{countLabel ?? "records"}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No records yet</p>
          )}
        </div>
        {status || statusLabel ? (
          <StatusBadge status={status} label={statusLabel} />
        ) : null}
      </div>
      {readiness ? <div className="mt-4 text-sm">{readiness}</div> : null}
      {lastUpdated ? (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Last activity: {lastUpdated}
        </p>
      ) : null}
    </Link>
  );
}
