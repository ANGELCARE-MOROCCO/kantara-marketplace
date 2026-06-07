import type { ReactNode } from "react";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

export type WorkflowBoardColumn<T> = {
  id: string;
  title: string;
  status?: string;
  records: T[];
  empty: string;
};

type WorkflowBoardProps<T> = {
  columns: WorkflowBoardColumn<T>[];
  renderCard: (record: T) => ReactNode;
  hrefForRecord?: (record: T) => string;
};

export function WorkflowBoard<T>({
  columns,
  renderCard,
  hrefForRecord,
}: WorkflowBoardProps<T>) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[920px] gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
        {columns.map((column) => (
          <section key={column.id} className="rounded-md border bg-background shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b bg-muted/40 p-3">
              <div>
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{column.records.length} records</p>
              </div>
              <StatusBadge status={column.status ?? column.id} label={String(column.records.length)} />
            </div>
            <div className="space-y-2 p-3">
              {column.records.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  {column.empty}
                </div>
              ) : (
                column.records.slice(0, 8).map((record, index) => {
                  const content = renderCard(record);
                  const href = hrefForRecord?.(record);
                  return href ? (
                    <Link key={href} href={href} className="block">
                      {content}
                    </Link>
                  ) : (
                    <div key={index}>{content}</div>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
