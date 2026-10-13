import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function Button({ variant = "primary", className = "", ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  }[variant];
  return <button {...p} className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${v} ${className}`} />;
}

export function Alert({ kind, children }: { kind: "error" | "success" | "warn"; children: ReactNode }) {
  const c = { error: "bg-red-50 text-red-700 border-red-200", success: "bg-emerald-50 text-emerald-700 border-emerald-200", warn: "bg-amber-50 text-amber-800 border-amber-200" }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "green" | "amber" | "red" }) {
  const c = { slate: "bg-slate-100 text-slate-700", indigo: "bg-indigo-50 text-indigo-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}
