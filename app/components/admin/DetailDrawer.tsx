import type { ReactNode } from "react";

type DetailDrawerProps = {
  title: string;
  subtitle?: string | null;
  children?: ReactNode;
  tabs?: {
    id: string;
    label: string;
    badge?: string | number | null;
    content: ReactNode;
  }[];
};

export function DetailDrawer({ title, subtitle, children, tabs }: DetailDrawerProps) {
  return (
    <aside className="rounded-md border bg-background p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {tabs?.length ? (
        <>
          <div className="mt-5 flex gap-2 overflow-x-auto border-b pb-2">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={`#${tab.id}`}
                className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md border bg-background px-3 text-sm font-medium hover:border-foreground/30"
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge !== null ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {tab.badge}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
          <div className="mt-5 space-y-6">
            {tabs.map((tab) => (
              <section key={tab.id} id={tab.id} className="scroll-mt-24">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {tab.label}
                </h3>
                {tab.content}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 space-y-5">{children}</div>
      )}
    </aside>
  );
}
