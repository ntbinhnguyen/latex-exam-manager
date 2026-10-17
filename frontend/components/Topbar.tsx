"use client";
import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/": "Tổng quan",
  "/import": "Nhập đề LaTeX",
  "/questions": "Ngân hàng câu hỏi",
  "/exams": "Ma trận & Sinh đề",
  "/trash": "Thùng rác",
};

export default function Topbar() {
  const path = usePathname();
  const title = titles[path] ?? titles[Object.keys(titles).find((k) => path.startsWith(k)) ?? "/"];
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-8 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <span className="text-xs text-muted">/ Quản lý đề thi</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Tìm kiếm câu hỏi, đề thi…"
            className="h-9 w-72 rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-soft focus:border-primary focus:bg-surface focus:outline-none"
          />
        </div>
        <button className="rounded-lg p-2 text-muted hover:bg-accent-soft hover:text-accent" title="Thông báo">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-white">NH</div>
      </div>
    </header>
  );
}
