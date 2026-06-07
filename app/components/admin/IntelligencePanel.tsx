import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Lightbulb } from "lucide-react";
import { ReadinessMeter } from "./ReadinessMeter";
import { RiskBadge } from "./RiskBadge";

export type IntelligenceItem = {
  id: string;
  title: string;
  description: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  href?: string;
  actionLabel?: string;
};

type IntelligencePanelProps = {
  title?: string;
  readiness?: { label: string; score: number | null; detail?: string }[];
  blockers?: IntelligenceItem[];
  suggestions?: IntelligenceItem[];
  children?: ReactNode;
};

export function IntelligencePanel({
  title = "Operations intelligence",
  readiness = [],
  blockers = [],
  suggestions = [],
  children,
}: IntelligencePanelProps) {
  return (
    <section className="space-y-4 rounded-md border bg-background p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Derived from live operational records and provider state.
        </p>
      </div>
      {readiness.length ? (
        <div className="grid gap-3">
          {readiness.map((item) => (
            <ReadinessMeter key={item.label} {...item} size="compact" />
          ))}
        </div>
      ) : null}
      <IntelligenceList
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Blockers"
        empty="No active blockers for this context."
        items={blockers}
      />
      <IntelligenceList
        icon={<Lightbulb className="h-4 w-4" />}
        title="Next best actions"
        empty="No suggested actions right now."
        items={suggestions}
      />
      {children}
    </section>
  );
}

function IntelligenceList({
  icon,
  title,
  empty,
  items,
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  items: IntelligenceItem[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            {empty}
          </p>
        ) : (
          items.map((item) => {
            const content = (
              <div className="rounded-md border p-3 transition-colors hover:border-foreground/30">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <RiskBadge severity={item.severity} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                {item.actionLabel ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium">
                    {item.actionLabel}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </p>
                ) : null}
              </div>
            );
            return item.href ? (
              <Link key={item.id} href={item.href}>
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })
        )}
      </div>
    </div>
  );
}
