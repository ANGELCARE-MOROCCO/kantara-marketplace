import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

type LinkedRecordCardProps = {
  type: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href?: string;
  Icon?: ComponentType<{ className?: string }>;
  meta?: string;
};

export function LinkedRecordCard({
  type,
  title,
  subtitle,
  status,
  href,
  Icon,
  meta,
}: LinkedRecordCardProps) {
  const content = (
    <div className="rounded-md border bg-background p-3 transition-colors hover:border-foreground/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {type}
          </p>
          <p className="mt-1 truncate text-sm font-semibold">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {status ? <StatusBadge status={status} /> : null}
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          {href ? <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> : null}
        </div>
      </div>
      {meta ? <p className="mt-2 text-xs text-muted-foreground">{meta}</p> : null}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
