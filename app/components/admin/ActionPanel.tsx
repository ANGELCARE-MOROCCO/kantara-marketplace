import type { ReactNode } from "react";

type ActionPanelProps = {
  title: string;
  description?: string;
  children: ReactNode;
  disabledReason?: string | null;
  result?: ReactNode;
};

export function ActionPanel({
  title,
  description,
  children,
  disabledReason,
  result,
}: ActionPanelProps) {
  return (
    <div className="rounded-md border bg-background p-4 shadow-sm">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {disabledReason ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {disabledReason}
        </div>
      ) : null}
      {result ? <div className="mt-4">{result}</div> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}
