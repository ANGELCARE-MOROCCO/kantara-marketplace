import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandHeader } from "./CommandHeader";

type ModuleShellProps = {
  title: string;
  eyebrow?: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  moduleStatus?: string | null;
  statusLabel?: string | null;
  lastActivity?: string | null;
  environment?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  navigation?: ReactNode;
  intelligence?: ReactNode;
  stickyActions?: ReactNode;
  layout?: "standard" | "split" | "operations";
  notice?: string | null;
  error?: string | null;
  className?: string;
};

export function ModuleShell({
  title,
  eyebrow = "Kantara Command Center",
  description,
  children,
  actions,
  moduleStatus,
  statusLabel,
  lastActivity,
  environment,
  primaryAction,
  secondaryActions,
  navigation,
  intelligence,
  stickyActions,
  layout = "standard",
  notice,
  error,
  className,
}: ModuleShellProps) {
  return (
    <section className={cn("min-h-screen bg-slate-50/60", className)}>
      <div className="w-full max-w-none px-5 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to command center
        </Link>

        <CommandHeader
          title={title}
          eyebrow={eyebrow}
          description={description}
          status={moduleStatus}
          statusLabel={statusLabel}
          lastActivity={lastActivity}
          environment={environment}
          primaryAction={primaryAction ?? actions}
          secondaryActions={secondaryActions}
        />

        {notice ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <div
          className={cn(
            "mt-8 gap-5",
            layout === "operations" && "grid xl:grid-cols-[220px_minmax(0,1fr)_360px]",
            layout === "split" && "grid xl:grid-cols-[minmax(0,1fr)_360px]"
          )}
        >
          {navigation ? (
            <aside className="min-w-0 xl:sticky xl:top-5 xl:self-start">{navigation}</aside>
          ) : null}
          <main className="min-w-0">{children}</main>
          {intelligence ? (
            <aside className="mt-5 min-w-0 xl:sticky xl:top-5 xl:mt-0 xl:self-start">
              {intelligence}
            </aside>
          ) : null}
        </div>
        {stickyActions ? (
          <div className="sticky bottom-4 z-20 mt-6 rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur">
            {stickyActions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
