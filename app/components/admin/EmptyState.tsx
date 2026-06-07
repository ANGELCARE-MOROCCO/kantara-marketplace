import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, FileSearch, ShieldCheck } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  why?: string;
  createsRecords?: string;
  checklist?: string[];
  links?: ReactNode | { href: string; label: string }[];
};

export function EmptyState({
  title,
  description,
  action,
  why,
  createsRecords,
  checklist = [],
  links,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Operational empty state</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {why || createsRecords ? (
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          {why ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium">Why this is empty</p>
              <p className="mt-1 text-slate-600">{why}</p>
            </div>
          ) : null}
          {createsRecords ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium">How records start</p>
              <p className="mt-1 text-slate-600">{createsRecords}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {checklist.length ? (
        <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {checklist.map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {links ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.isArray(links)
            ? links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:border-slate-400"
                >
                  {link.label}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              ))
            : links}
        </div>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
