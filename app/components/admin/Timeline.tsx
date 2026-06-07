import { formatDateTime } from "@/app/lib/marketplaceStatus";

type TimelineItem = {
  id: string;
  type: string;
  message?: string | null;
  summary?: string | null;
  createdAt: Date;
  actor?: string | null;
  payloadPreview?: string | null;
  href?: string;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No audit events yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border bg-background p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm font-medium">{item.summary ?? item.message ?? item.type}</p>
            <time className="text-xs text-muted-foreground">
              {formatDateTime(item.createdAt)}
            </time>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span>{item.type.replaceAll("_", " ")}</span>
            {item.actor ? <span>Actor: {item.actor}</span> : null}
            {item.href ? <a className="font-medium underline-offset-4 hover:underline" href={item.href}>Linked record</a> : null}
          </div>
          {item.payloadPreview ? (
            <pre className="mt-3 max-h-24 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {item.payloadPreview}
            </pre>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
