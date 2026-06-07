import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FilterOption = {
  value: string;
  label: string;
};

type FilterSelect = {
  name: string;
  label: string;
  value?: string | null;
  options: FilterOption[];
};

type FilterBarProps = {
  action: string;
  query?: string | null;
  queryPlaceholder?: string;
  selects?: FilterSelect[];
  children?: ReactNode;
};

export function FilterBar({
  action,
  query,
  queryPlaceholder = "Search records",
  selects = [],
  children,
}: FilterBarProps) {
  return (
    <form
      action={action}
      className="rounded-md border bg-background p-4 shadow-sm"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(160px,220px))]">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query ?? ""}
              placeholder={queryPlaceholder}
              className="pl-9"
            />
          </label>
          {selects.map((select) => (
            <label key={select.name} className="block">
              <span className="sr-only">{select.label}</span>
              <select
                name={select.name}
                defaultValue={select.value ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {select.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {children}
        </div>
        <div className="flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="outline">
            <a href={action}>Reset</a>
          </Button>
        </div>
      </div>
    </form>
  );
}
