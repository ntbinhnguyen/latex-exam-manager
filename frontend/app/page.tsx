"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuestionBank } from "@/lib/use-question-bank";
import { flattenTree } from "@/lib/tree";
import {
  LEVEL_MAP,
  TYPE_LABEL,
  isAssignable,
  nodeKey,
  parseNodeId,
  parseQid,
  questionAncestors,
  typeAbbrOfLabel,
} from "@/lib/qid";
import type { QuestionItem } from "@/components/question-bank/types";
import { Alert, Card, PageHeader } from "@/components/ui";

/* ---------- Thống kê theo ID mới: Loại.Mức.Lớp.Chương.Bài.Dạng (VD TN.M1.T2.C1.B1.01) ---------- */

const LEVELS = ["M1", "M2", "M3", "M4"] as const;
type Lv = (typeof LEVELS)[number];
type LevelCounts = Record<Lv, number>;

const TYPE_ORDER = ["TN", "DS", "TLN", "TL"];

// màu theo mức: đậm dần từ Nhận biết → Vận dụng cao (class viết đầy đủ để Tailwind nhận diện)
const LEVEL_BAR: Record<Lv, string> = {
  M1: "bg-indigo-200",
  M2: "bg-indigo-400",
  M3: "bg-indigo-600",
  M4: "bg-indigo-900",
};

// màu đặc tương ứng, dùng cho biểu đồ tròn / vòng tiến trình (SVG không dùng được class Tailwind)
const LEVEL_HEX: Record<Lv, string> = {
  M1: "#c7d2fe",
  M2: "#818cf8",
  M3: "#4f46e5",
  M4: "#312e81",
};

// chip nhãn mức độ (sáng/tối)
const LEVEL_CHIP: Record<Lv, string> = {
  M1: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30",
  M2: "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 dark:bg-indigo-400/20 dark:text-indigo-200 dark:ring-indigo-400/40",
  M3: "bg-indigo-600 text-white ring-1 ring-indigo-600 dark:bg-indigo-500 dark:text-white dark:ring-indigo-400",
  M4: "bg-indigo-950 text-white ring-1 ring-indigo-900 dark:bg-indigo-300 dark:text-indigo-950 dark:ring-indigo-200",
};

const zero = (): LevelCounts => ({ M1: 0, M2: 0, M3: 0, M4: 0 });
const sum = (c: LevelCounts) => c.M1 + c.M2 + c.M3 + c.M4;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const typeName = (abbr: string) => TYPE_LABEL[abbr] ?? "Loại khác";

/* ---------- Phạm vi lọc Lớp / Chương ---------- */

const ALL = "all";

type Scope = { grade: string; chapter: string };

// Lớp và Chương của một câu nằm ngay trong ID (Loại.Mức.Lớp.Chương.Bài.Dạng).
// Dùng đúng parseQid/nodeKey như computeStats để tập câu lọc ra khớp với số liệu thống kê.
function scopeOfCode(code: string): Scope | null {
  const parsed = parseQid(code);
  if (!parsed || parsed.legacy || !isAssignable(parsed)) return null;
  const chapter = nodeKey(parsed.parts, "chapter");
  // id của chương có dạng <lớp>.<chương> — xem ChapterRows: n.id.startsWith(`${g.id}.`)
  return { grade: chapter.split(".")[0], chapter };
}

interface TypeRow {
  abbr: string;
  levels: LevelCounts;
  noId: number;
  total: number;
}

function computeStats(questions: QuestionItem[]) {
  const byLevel = zero();
  const byType = new Map<string, TypeRow>();
  const nodeCount = new Map<string, number>();
  const chapterLevels = new Map<string, LevelCounts>();
  let valid = 0;

  for (const q of questions) {
    const parsed = parseQid(q.code);
    const ok = !!parsed && !parsed.legacy && isAssignable(parsed);
    // Loại câu lấy theo nhãn của câu; nếu chưa nhận dạng được thì dùng loại trong ID
    const abbr = typeAbbrOfLabel(q.type) ?? (ok ? parsed!.parts.type : undefined) ?? "?";
    const row = byType.get(abbr) ?? { abbr, levels: zero(), noId: 0, total: 0 };
    byType.set(abbr, row);
    row.total++;

    if (!ok || !parsed) {
      row.noId++;
      continue;
    }
    valid++;
    const lv = parsed.parts.level as Lv;
    byLevel[lv]++;
    row.levels[lv]++;
    questionAncestors(q.code).forEach((k) => nodeCount.set(k, (nodeCount.get(k) ?? 0) + 1));
    const ck = nodeKey(parsed.parts, "chapter");
    const cl = chapterLevels.get(ck) ?? zero();
    cl[lv]++;
    chapterLevels.set(ck, cl);
  }

  const types = [...byType.values()].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.abbr);
    const ib = TYPE_ORDER.indexOf(b.abbr);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return { total: questions.length, valid, invalid: questions.length - valid, byLevel, types, nodeCount, chapterLevels };
}

/* ---------- Khối hiển thị dùng chung ---------- */

function LevelBar({ counts, className = "h-2" }: { counts: LevelCounts; className?: string }) {
  const total = sum(counts);
  if (!total) return <div className={`${className} rounded-full bg-slate-100 dark:bg-slate-800`} />;
  return (
    <div
      className={`flex ${className} overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10`}
    >
      {LEVELS.map((l) =>
        counts[l] ? (
          <div
            key={l}
            className={`${LEVEL_BAR[l]} transition-[width] duration-500 ease-out`}
            style={{ width: `${(counts[l] / total) * 100}%` }}
            title={`${LEVEL_MAP[l]}: ${counts[l]}`}
          />
        ) : null,
      )}
    </div>
  );
}

function LevelDonut({ counts, center, caption }: { counts: LevelCounts; center: string; caption: string }) {
  const total = sum(counts);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative h-44 w-44 shrink-0">
      <svg viewBox="0 0 176 176" className="h-full w-full -rotate-90">
        <circle cx="88" cy="88" r={R} fill="none" strokeWidth={20} className="stroke-slate-100 dark:stroke-slate-800" />
        {total > 0 &&
          LEVELS.map((l) => {
            const frac = counts[l] / total;
            const seg = (
              <circle
                key={l}
                cx="88"
                cy="88"
                r={R}
                fill="none"
                strokeWidth={20}
                stroke={LEVEL_HEX[l]}
                strokeDasharray={`${frac * C} ${C - frac * C}`}
                strokeDashoffset={-offset * C}
              />
            );
            offset += frac;
            return seg;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">{center}</span>
        <span className="mt-0.5 max-w-[7rem] text-center text-xs leading-tight text-slate-500 dark:text-slate-400">{caption}</span>
      </div>
    </div>
  );
}

function ProgressRing({ value, size = 132 }: { value: number; size?: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={R} fill="none" strokeWidth={11} className="stroke-slate-100 dark:stroke-slate-800" />
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          strokeWidth={11}
          strokeLinecap="round"
          stroke="url(#ringGrad)"
          strokeDasharray={`${(clamped / 100) * C} ${C}`}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{clamped}%</span>
        <span className="text-[11px] uppercase tracking-wide text-slate-400">độ phủ</span>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  bank: "M4 7.5h16M4 12h16M4 16.5h16",
  check: "M4.5 12.5l5 5 10-11",
  alert: "M12 8.5v4.5m0 3.2h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
};

type Tone = "indigo" | "emerald" | "amber" | "sky";

const TONES: Record<Tone, { badge: string; value: string; bar: string }> = {
  indigo: {
    badge: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
    value: "text-slate-900 dark:text-white",
    bar: "bg-gradient-to-r from-indigo-500 to-violet-500",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    value: "text-slate-900 dark:text-white",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-500",
  },
  amber: {
    badge: "bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
    value: "text-amber-600 dark:text-amber-400",
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
  },
  sky: {
    badge: "bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    value: "text-slate-900 dark:text-white",
    bar: "bg-gradient-to-r from-sky-500 to-cyan-500",
  },
};

function KpiCard({
  label,
  value,
  suffix,
  hint,
  icon,
  tone = "indigo",
  progress,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  icon: keyof typeof ICONS;
  tone?: Tone;
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <Card className="group relative overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.badge}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d={ICONS[icon]} />
          </svg>
        </span>
      </div>
      <div className={`mt-3 flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums tracking-tight ${t.value}`}>
        {value}
        {suffix && <span className="text-base font-normal text-slate-400">{suffix}</span>}
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className={`h-full rounded-full ${t.bar} transition-[width] duration-500`} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {hint && <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </Card>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

/* ---------- Thanh bộ lọc Lớp / Chương ---------- */

function FilterBar({
  grade,
  chapter,
  onGrade,
  onChapter,
  onReset,
  grades,
  chapterGroups,
  scopedTotal,
  bankTotal,
  scopeLabel,
}: {
  grade: string;
  chapter: string;
  onGrade: (value: string) => void;
  onChapter: (value: string) => void;
  onReset: () => void;
  grades: { id: string; title: string }[];
  chapterGroups: { id: string; title: string; chapters: { id: string; title: string }[] }[];
  scopedTotal: number;
  bankTotal: number;
  scopeLabel: string;
}) {
  const active = grade !== ALL || chapter !== ALL;
  const chapterCount = chapterGroups.reduce((n, g) => n + g.chapters.length, 0);
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      on
        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    }`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Phạm vi thống kê</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Đang xem <strong className="font-medium text-slate-700 dark:text-slate-200">{scopeLabel}</strong>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
              active
                ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {scopedTotal} / {bankTotal} câu
          </span>
          {active && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3 w-3">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Lớp — chọn nhanh bằng chip */}
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo lớp">
        <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lớp</span>
        <button type="button" aria-pressed={grade === ALL} onClick={() => onGrade(ALL)} className={chip(grade === ALL)}>
          Tất cả
        </button>
        {grades.map((g) => (
          <button key={g.id} type="button" aria-pressed={grade === g.id} onClick={() => onGrade(g.id)} className={chip(grade === g.id)}>
            {g.title}
          </button>
        ))}
      </div>

      {/* Chương — danh sách phụ thuộc lớp đang chọn */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="chapter-filter" className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Chương
        </label>
        <select
          id="chapter-filter"
          value={chapter}
          onChange={(e) => onChapter(e.target.value)}
          disabled={chapterCount === 0}
          className="h-9 min-w-[220px] max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-indigo-500/20"
        >
          <option value={ALL}>{grade === ALL ? "Tất cả chương" : "Tất cả chương của lớp này"}</option>
          {chapterGroups.map((g) =>
            grade === ALL ? (
              <optgroup key={g.id} label={g.title}>
                {g.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.title}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} — {c.title}
                </option>
              ))
            ),
          )}
        </select>
        {chapterCount === 0 && <span className="text-xs text-slate-400">Chưa có mục lục cho phạm vi này</span>}
      </div>
    </Card>
  );
}

/* ---------- Trang ---------- */

export default function Dashboard() {
  const bank = useQuestionBank();
  const { questions, tree, nodeMap } = bank;
  // hook có thể chưa tải xong dữ liệu: tránh nháy thông báo "chưa có câu hỏi"
  const loading = Boolean((bank as { loading?: boolean }).loading);

  // ---- Bộ lọc theo Lớp / Chương (mặc định "Tất cả") ----
  const [grade, setGrade] = useState<string>(ALL);
  const [chapter, setChapter] = useState<string>(ALL);

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const treeGrades = useMemo(() => flat.filter((n) => n.kind === "grade"), [flat]);

  // Lớp: lấy từ mục lục, bổ sung lớp đã xuất hiện trong ID nhưng chưa có trong mục lục
  const gradeList = useMemo(() => {
    const m = new Map<string, string>();
    treeGrades.forEach((g) => m.set(g.id, nodeMap.get(g.id)?.title ?? g.title));
    for (const q of questions) {
      const sc = scopeOfCode(q.code);
      if (sc && !m.has(sc.grade)) m.set(sc.grade, nodeMap.get(sc.grade)?.title ?? sc.grade);
    }
    return [...m.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [treeGrades, questions, nodeMap]);

  // Chương nhóm theo Lớp; phụ thuộc lớp đang chọn nên đổi lớp là danh sách tự thu hẹp
  const chapterGroups = useMemo(() => {
    const byGrade = new Map<string, { id: string; title: string }[]>();
    const titles = new Map<string, string>();
    flat.filter((n) => n.kind === "chapter").forEach((n) => titles.set(n.id, n.title));
    for (const q of questions) {
      const sc = scopeOfCode(q.code);
      if (sc && !titles.has(sc.chapter)) titles.set(sc.chapter, sc.chapter);
    }
    for (const [id, title] of titles) {
      const gid = id.split(".")[0];
      const arr = byGrade.get(gid) ?? [];
      arr.push({ id, title });
      byGrade.set(gid, arr);
    }
    for (const arr of byGrade.values()) arr.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const source = grade === ALL ? gradeList : gradeList.filter((g) => g.id === grade);
    return source.map((g) => ({ id: g.id, title: g.title, chapters: byGrade.get(g.id) ?? [] })).filter((g) => g.chapters.length > 0);
  }, [flat, questions, grade, gradeList]);

  // MỘT nguồn dữ liệu duy nhất cho mọi thẻ, biểu đồ và bảng bên dưới
  const scoped = useMemo(() => {
    if (grade === ALL && chapter === ALL) return questions;
    return questions.filter((q) => {
      const sc = scopeOfCode(q.code);
      if (!sc) return false; // câu chưa gắn ID không thuộc Lớp/Chương nào
      if (grade !== ALL && sc.grade !== grade) return false;
      if (chapter !== ALL && sc.chapter !== chapter) return false;
      return true;
    });
  }, [questions, grade, chapter]);

  const s = useMemo(() => computeStats(scoped), [scoped]);

  const scopeActive = grade !== ALL || chapter !== ALL;
  const scopePrefix = chapter !== ALL ? `${chapter}.` : grade !== ALL ? `${grade}.` : "";
  const scopedFlat = useMemo(() => (scopePrefix ? flat.filter((n) => n.id.startsWith(scopePrefix)) : flat), [flat, scopePrefix]);
  const grades = useMemo(() => (scopePrefix ? treeGrades.filter((g) => g.id.startsWith(scopePrefix)) : treeGrades), [treeGrades, scopePrefix]);

  const forms = useMemo(() => scopedFlat.filter((n) => n.kind === "form"), [scopedFlat]);
  const emptyForms = forms.filter((n) => !s.nodeCount.get(n.id));
  const coveredForms = forms.length - emptyForms.length;

  const scopeLabel = useMemo(() => {
    const g = grade === ALL ? null : gradeList.find((x) => x.id === grade)?.title ?? grade;
    const c = chapter === ALL ? null : flat.find((n) => n.id === chapter)?.title ?? chapter;
    return [g, c].filter(Boolean).join(" · ") || "toàn bộ ngân hàng";
  }, [grade, chapter, gradeList, flat]);

  const pickGrade = (value: string) => {
    setGrade(value);
    setChapter(ALL); // đổi lớp thì trả chương về "Tất cả"
  };
  const resetScope = () => {
    setGrade(ALL);
    setChapter(ALL);
  };

  const max = Math.max(1, ...LEVELS.map((l) => s.byLevel[l]));
  const low = s.byLevel.M1 + s.byLevel.M2;
  const high = s.byLevel.M3 + s.byLevel.M4;
  const lowPct = pct(low, s.valid);

  // xếp hạng chương theo số câu trong phạm vi đang lọc
  const topChapters = useMemo(() => {
    return scopedFlat
      .filter((n) => n.kind === "chapter")
      .map((n) => ({ id: n.id, title: n.title, counts: s.chapterLevels.get(n.id) ?? zero() }))
      .map((r) => ({ ...r, total: sum(r.counts) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [scopedFlat, s.chapterLevels]);

  const lessonTitleOf = (formId: string): string => {
    const p = parseNodeId(formId);
    return p ? (nodeMap.get(nodeKey(p.parts, "lesson"))?.title ?? "") : "";
  };

  return (
    <>
      <PageHeader title="Tổng quan" desc="Thống kê ngân hàng câu hỏi theo ID mới (Loại · Mức · Lớp · Chương · Bài · Dạng)" />
      {loading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
          <span className="sr-only">Đang tải…</span>
        </div>
      )}
      {!loading && questions.length === 0 && (
        <Alert kind="warn">
          Chưa có câu hỏi nào. Hãy <Link href="/import" className="font-medium underline">nhập file .tex</Link> để bắt đầu.
        </Alert>
      )}

      {!loading && questions.length > 0 && (
        <div className="space-y-6">
          {/* ---------- Bộ lọc Lớp / Chương: áp cho mọi thẻ, biểu đồ và bảng bên dưới ---------- */}
          <FilterBar
            grade={grade}
            chapter={chapter}
            onGrade={pickGrade}
            onChapter={setChapter}
            onReset={resetScope}
            grades={gradeList}
            chapterGroups={chapterGroups}
            scopedTotal={s.total}
            bankTotal={questions.length}
            scopeLabel={scopeLabel}
          />

          {s.total === 0 && (
            <Alert kind="warn">
              Không có câu hỏi nào thuộc phạm vi <strong>{scopeLabel}</strong>.
              <button type="button" onClick={resetScope} className="ml-1 font-medium underline">Xoá bộ lọc</button> để xem
              toàn bộ ngân hàng.
            </Alert>
          )}

          {s.total > 0 && (
            <>
          {/* ---------- Bảng chỉ số ---------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Tổng số câu hỏi"
              value={s.total}
              icon="bank"
              tone="indigo"
              hint={scopeActive ? `Trong phạm vi: ${scopeLabel}` : "Toàn bộ ngân hàng câu hỏi"}
            />
            <KpiCard
              label="Đã gắn ID hợp lệ"
              value={s.valid}
              icon="check"
              tone="emerald"
              progress={pct(s.valid, s.total)}
              hint={`${pct(s.valid, s.total)}% tổng số câu`}
            />
            <KpiCard
              label="Chưa gắn ID / ID lỗi"
              value={s.invalid}
              icon="alert"
              tone="amber"
              hint={s.invalid ? "Cần bổ sung ID để vào thống kê" : "Tất cả câu đều có ID hợp lệ"}
            />
            <KpiCard
              label="Dạng toán đã có câu"
              value={coveredForms}
              suffix={`/ ${forms.length}`}
              icon="grid"
              tone="sky"
              progress={pct(coveredForms, forms.length)}
              hint={
                scopeActive
                  ? `${pct(coveredForms, forms.length)}% số dạng trong phạm vi đang lọc`
                  : `${pct(coveredForms, forms.length)}% số dạng trên mục lục`
              }
            />
          </div>

          {s.invalid > 0 && (
            <Alert kind="warn">
              Có <strong>{s.invalid}</strong> câu chưa gắn ID hợp lệ nên chưa được tính vào thống kê Mức độ, Chương và Dạng toán.
              Mở câu hỏi trong ngân hàng và bấm “Gắn ID” để bổ sung.
            </Alert>
          )}

          {/* ---------- Mức độ + Loại × Mức ---------- */}
          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-2">
              <SectionTitle title="Theo mức độ" hint={`${s.valid} câu đã gắn ID`} />
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                <LevelDonut counts={s.byLevel} center={String(s.valid)} caption="câu đã gắn ID" />
                <div className="w-full space-y-3">
                  {LEVELS.map((l) => (
                    <div key={l} className="group">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_CHIP[l]}`}>{l}</span>
                          <span className="text-slate-600 dark:text-slate-300">{LEVEL_MAP[l]}</span>
                        </span>
                        <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                          {s.byLevel[l]}
                          <span className="ml-1 font-normal text-slate-400">({pct(s.byLevel[l], s.valid)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${LEVEL_BAR[l]} transition-[width] duration-500 ease-out`}
                          style={{ width: `${(s.byLevel[l] / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {s.valid > 0 && (
                <p className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  Mức 1–2: <strong className="text-slate-900 dark:text-white">{lowPct}%</strong> · Mức 3–4:{" "}
                  <strong className="text-slate-900 dark:text-white">{100 - lowPct}%</strong>
                  <span className="text-slate-400"> (chuẩn đề 70/30, tính trên câu đã gắn ID)</span>
                </p>
              )}
            </Card>

            <Card className="xl:col-span-3 overflow-x-auto">
              <SectionTitle title="Loại câu × Mức độ" hint={`${s.types.length} loại câu`} />
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="pb-2 font-medium">Loại câu</th>
                    {LEVELS.map((l) => (
                      <th key={l} className="pb-2 text-right font-medium">{l}</th>
                    ))}
                    <th className="pb-2 text-right font-medium" title="Chưa gắn ID hợp lệ">Chưa ID</th>
                    <th className="pb-2 text-right font-medium">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {s.types.map((t) => (
                    <tr
                      key={t.abbr}
                      className="border-t border-slate-100 transition-colors hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{typeName(t.abbr)}</span>
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {t.abbr}
                        </span>
                      </td>
                      {LEVELS.map((l) => (
                        <td key={l} className="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {t.levels[l] || <span className="text-slate-300 dark:text-slate-600">–</span>}
                        </td>
                      ))}
                      <td className={`py-2.5 text-right tabular-nums ${t.noId ? "font-medium text-amber-600 dark:text-amber-400" : "text-slate-300 dark:text-slate-600"}`}>
                        {t.noId || "–"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{t.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50/60 text-slate-900 dark:border-slate-700 dark:bg-slate-800/40 dark:text-white">
                    <td className="py-2.5 pr-3 font-semibold">Tổng</td>
                    {LEVELS.map((l) => (
                      <td key={l} className="py-2.5 text-right tabular-nums font-semibold">{s.byLevel[l]}</td>
                    ))}
                    <td className="py-2.5 text-right tabular-nums font-semibold">{s.invalid}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{s.total}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>

          {/* ---------- Độ phủ + Xếp hạng chương ---------- */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle title="Độ phủ Dạng toán" hint={`${emptyForms.length} dạng còn trống`} />
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <ProgressRing value={pct(coveredForms, forms.length)} />
                <div className="w-full">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    <strong className="text-lg tabular-nums text-slate-900 dark:text-white">{coveredForms}</strong>
                    <span className="text-slate-400"> / {forms.length} dạng đã có câu</span>
                  </p>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500"
                      style={{ width: `${pct(coveredForms, forms.length)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Còn <strong className="text-slate-600 dark:text-slate-300">{emptyForms.length}</strong> dạng chưa có câu hỏi — mở danh sách bên dưới để bổ sung.
                  </p>
                </div>
              </div>

              {emptyForms.length > 0 && (
                <details className="group mt-5 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm open:bg-white dark:border-slate-800 dark:bg-slate-800/30 dark:open:bg-slate-900/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-indigo-700 dark:text-indigo-300">
                    Xem {emptyForms.length} dạng chưa có câu hỏi
                    <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▾</span>
                  </summary>
                  <ul className="mt-3 max-h-72 space-y-1 overflow-auto pr-1">
                    {emptyForms.map((n) => {
                      const p = parseNodeId(n.id);
                      return (
                        <li
                          key={n.id}
                          className="flex items-baseline gap-2 rounded-lg border-t border-slate-100 px-1.5 py-1.5 first:border-t-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                        >
                          <span className="w-24 shrink-0 font-mono text-[11px] text-slate-400">{n.id}</span>
                          <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                            {n.title}
                            <span className="text-xs text-slate-400"> · {lessonTitleOf(n.id)}</span>
                          </span>
                          {p?.parts.level && (
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_CHIP[p.parts.level as Lv]}`}>
                              {p.parts.level}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </Card>

            <Card>
              <SectionTitle
                title={scopeActive && chapter !== ALL ? "Chương đang xem" : "Chương nhiều câu nhất"}
                hint={topChapters.length ? (scopeActive ? scopeLabel : "top 6") : undefined}
              />
              {topChapters.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Chưa có mục lục (Lớp / Chương).</p>
              ) : (
                <ol className="space-y-3">
                  {topChapters.map((c, i) => (
                    <li key={c.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
                          <span className="truncate text-slate-700 dark:text-slate-200">{c.title}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold text-slate-900 dark:text-white">{c.total}</span>
                      </div>
                      <LevelBar counts={c.counts} />
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          {/* ---------- Theo chương ---------- */}
          <Card className="overflow-x-auto">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">Theo chương</h2>
                {scopeActive && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20">
                    {scopeLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                {LEVELS.map((l) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${LEVEL_BAR[l]}`} /> {l}
                  </span>
                ))}
              </div>
            </div>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="pb-2 font-medium">Chương</th>
                  {LEVELS.map((l) => (
                    <th key={l} className="pb-2 text-right font-medium">{l}</th>
                  ))}
                  <th className="pb-2 text-right font-medium">Tổng</th>
                  <th className="w-40 pb-2 pl-4 font-medium">Cơ cấu mức độ</th>
                </tr>
              </thead>
              <tbody>
                {grades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      {scopeActive
                        ? `Phạm vi ${scopeLabel} chưa có mục lục (Lớp / Chương).`
                        : "Chưa có mục lục (Lớp / Chương). Nạp file mục lục để xem thống kê theo chương."}
                    </td>
                  </tr>
                )}
                {grades.map((g) => (
                  <ChapterRows
                    key={g.id}
                    gradeTitle={g.title}
                    showGrade={grades.length > 1}
                    chapters={scopedFlat.filter((n) => n.kind === "chapter" && n.id.startsWith(`${g.id}.`))}
                    levels={s.chapterLevels}
                    highlightId={chapter === ALL ? undefined : chapter}
                  />
                ))}
              </tbody>
            </table>
          </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ChapterRows({
  gradeTitle,
  showGrade,
  chapters,
  levels,
  highlightId,
}: {
  gradeTitle: string;
  showGrade: boolean;
  chapters: { id: string; title: string }[];
  levels: Map<string, LevelCounts>;
  highlightId?: string;
}) {
  return (
    <>
      {showGrade && (
        <tr className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50">
          <td colSpan={7} className="py-2 pl-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {gradeTitle}
          </td>
        </tr>
      )}
      {chapters.map((c) => {
        const lv = levels.get(c.id) ?? zero();
        return (
          <tr
            key={c.id}
            className={`border-t border-slate-100 transition-colors dark:border-slate-800 ${
              c.id === highlightId ? "bg-indigo-50/70 dark:bg-indigo-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
            }`}
          >
            <td className="py-2.5 pr-2 text-slate-700 dark:text-slate-200">{c.title}</td>
            {LEVELS.map((l) => (
              <td key={l} className="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {lv[l] || <span className="text-slate-300 dark:text-slate-600">–</span>}
              </td>
            ))}
            <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{sum(lv)}</td>
            <td className="py-2.5 pl-4">
              <LevelBar counts={lv} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
