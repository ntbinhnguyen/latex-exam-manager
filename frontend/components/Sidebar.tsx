"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, LayoutDashboard, Database, FileSpreadsheet } from "lucide-react";

const items = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/questions", label: "Quản lý câu hỏi", icon: Database },
  { href: "/exams", label: "Ma trận & Sinh đề", icon: FileSpreadsheet },
];

export default function Sidebar() {
  const path = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-200 select-none ${
        isCollapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="text-base font-bold text-[#4A0E17] truncate">LaTeX Exam</div>
            <div className="text-[11px] text-slate-400 truncate">Quản lý đề thi Toán</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition mx-auto"
          title={isCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              title={isCollapsed ? it.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition ${
                active
                  ? "bg-[#4A0E17]/10 text-[#4A0E17] font-semibold"
                  : "text-slate-600 hover:bg-slate-100"
              } ${isCollapsed ? "justify-center px-2" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}