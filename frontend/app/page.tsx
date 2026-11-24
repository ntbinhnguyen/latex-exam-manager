"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  Filter,
  Layers,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
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
import { InlineLatex } from "@/components/question-bank/LatexRenderer";
import { Alert, Card } from "@/components/ui";

/* ---------- Thống kê theo ID mới: Loại.Mức.Lớp.Chương.Bài.Dạng (VD TN.M1.T2.C1.B1.01) ---------- */

const LEVELS = ["M1", "M2", "M3", "M4"] as const;
type Lv = (typeof LEVELS)[number];
type LevelCounts = Record<Lv, number>;

const TYPE_ORDER = ["TN", "DS", "TLN", "TL"];

const LEVEL_BAR: Record<Lv, string> = {
  M1: "bg-sky-400",
  M2: "bg-emerald-500",
  M3: "bg-amber-500",
  M4: "bg-[#6D1A27]",
};

const LEVEL_HEX: Record<Lv, string> = {
  M1: "#38bdf8",
  M2: "#10b981",
  M3: "#f59e0b",
  M4: "#6d1a27",
};

const LEVEL_CHIP: Record<Lv, string> = {
  M1: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  M2: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  M3: "bg-amber-50 text-amber-800 ring-1 ring-amber-300",
  M4: "bg-[#4A0E17] text-white ring-1 ring-[#4A0E17]",
};

const TYPE_BADGE: Record<string, string> = {
  TN: "bg-[#4A0E17]/10 text-[#4A0E17]",
  DS: "bg-emerald-50 text-emerald-700",
  TLN: "bg-amber-50 text-amber-800",
  TL: "bg-sky-50 text-sky-700",
};

const zero = (): LevelCounts => ({ M1: 0, M2: 0, M3: 0, M4: 0 });
const sum = (c: LevelCounts) => c.M1 + c.M2 + c.M3 + c.M4;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const typeName = (abbr: string) => TYPE_LABEL[abbr] ?? "Loại khác";

/* ---------- Phạm vi lọc Lớp / Chương ---------- */

const ALL = "all";

type Scope = { grade: string; chapter: string };

function scopeOfCode(code: string): Scope | null {
  const parsed = parseQid(code);
  if (!parsed || parsed.legacy || !isAssignable(parsed)) return null;
  const chapter = nodeKey(parsed.parts, "chapter");
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
  if (!total) return <div className={`${className} rounded-full bg-slate-100`} />;
  return (
    <div className={`flex ${className} overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-900/5`}>
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
        <circle cx="88" cy="88" r={R} fill="none" strokeWidth={20} className="stroke-slate-100" />
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
        <span className="text-3xl font-bold tabular-nums text-slate-900">{center}</span>
        <span className="mt-0.5 max-w-[7rem] text-center text-[11px] leading-tight text-slate-500">{caption}</span>
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
        <circle cx="66" cy="66" r={R} fill="none" strokeWidth={11} className="stroke-slate-100" />
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
            <stop offset="0%" stopColor="#4A0E17" />
            <stop offset="100%" stopColor="#F2A60C" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-slate-900">{clamped}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">độ phủ</span>
      </div>
    </div>
  );
}

type Tone = "burgundy" | "emerald" | "amber" | "sky";

const TONES: Record<Tone, { accent: string; badge: string; value: string; bar: string }> = {
  burgundy: {
    accent: "border-t-[#4A0E17]",
    badge: "bg-[#4A0E17]/10 text-[#4A0E17]",
    value: "text-slate-900",
    bar: "bg-gradient-to-r from-[#4A0E17] to-[#8C1D2D]",
  },
  emerald: {
    accent: "border-t-emerald-500",
    badge: "bg-emerald-50 text-emerald-600",
    value: "text-slate-900",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-500",
  },
  amber: {
    accent: "border-t-amber-500",
    badge: "bg-amber-50 text-amber-600",
    value: "text-amber-700",
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
  },
  sky: {
    accent: "border-t-sky-500",
    badge: "bg-sky-50 text-sky-600",
    value: "text-slate-900",
    bar: "bg-gradient-to-r from-sky-500 to-cyan-500",
  },
};

function KpiCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = "burgundy",
  progress,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  progress?: number;
}) {
  const t = TONES[tone];
  return (
    <Card className={`group relative overflow-hidden border-t-4 ${t.accent} transition duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.badge}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`mt-3 flex items-baseline gap-1.5 text-3xl font-bold tabular-nums tracking-tight ${t.value}`}>
        {value}
        {suffix && <span className="text-base font-medium text-slate-400">{suffix}</span>}
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${t.bar} transition-[width] duration-500`} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
      <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
      {hint && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">{hint}</span>}
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
    `rounded-full px-3 py-1 text-xs font-semibold transition ${
      on
        ? "bg-[#4A0E17] text-white shadow-sm"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  return (
    <Card className="border-slate-200/90 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4A0E17]/10 text-[#4A0E17]">
            <Filter className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900">Phạm vi thống kê</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Đang xem <strong className="font-semibold text-[#4A0E17]"><InlineLatex content={scopeLabel} /></strong>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
              active ? "bg-[#F2A60C]/20 text-[#4A0E17]" : "bg-slate-100 text-slate-600"
            }`}
          >
            {scopedTotal} / {bankTotal} câu
          </span>
          {active && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3 w-3" />
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo lớp">
        <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Lớp</span>
        <button type="button" aria-pressed={grade === ALL} onClick={() => onGrade(ALL)} className={chip(grade === ALL)}>
          Tất cả
        </button>
        {grades.map((g) => (
          <button key={g.id} type="button" aria-pressed={grade === g.id} onClick={() => onGrade(g.id)} className={chip(grade === g.id)}>
            <InlineLatex content={g.title} />
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="chapter-filter" className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Chương
        </label>
        <select
          id="chapter-filter"
          value={chapter}
          onChange={(e) => onChapter(e.target.value)}
          disabled={chapterCount === 0}
          className="h-9 min-w-[240px] max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-2xs transition focus:border-[#4A0E17] focus:outline-none focus:ring-2 focus:ring-[#4A0E17]/15 disabled:cursor-not-allowed disabled:opacity-60"
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
  const { questions, pending, tree, nodeMap } = bank;
  const loading = Boolean((bank as { loading?: boolean }).loading);

  const [grade, setGrade] = useState<string>(ALL);
  const [chapter, setChapter] = useState<string>(ALL);

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const treeGrades = useMemo(() => flat.filter((n) => n.kind === "grade"), [flat]);

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

  const scoped = useMemo(() => {
    if (grade === ALL && chapter === ALL) return questions;
    return questions.filter((q) => {
      const sc = scopeOfCode(q.code);
      if (!sc) return false;
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
    setChapter(ALL);
  };
  const resetScope = () => {
    setGrade(ALL);
    setChapter(ALL);
  };

  const max = Math.max(1, ...LEVELS.map((l) => s.byLevel[l]));
  const low = s.byLevel.M1 + s.byLevel.M2;
  const high = s.byLevel.M3 + s.byLevel.M4;
  const lowPct = pct(low, s.valid);

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
    <div className="space-y-6">
      {/* ---------- Hero Header ---------- */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4A0E17] via-[#5c121e] to-[#2e080e] p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#F2A60C]/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#F2A60C] backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Bảng điều khiển ngân hàng đề thi
            </div>
            <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-3xl">Tổng quan hệ thống</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/75 sm:text-sm">
              Theo dõi cơ cấu câu hỏi theo chuẩn ID mới (Loại · Mức độ · Lớp · Chương · Bài · Dạng) và độ phủ chương trình.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pending.length > 0 && (
              <Link
                href="/questions"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F2A60C] px-3.5 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:brightness-95"
              >
                <ClipboardCheck className="h-4 w-4" />
                {pending.length} câu chờ duyệt
              </Link>
            )}
            <Link
              href="/questions"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              <Database className="h-4 w-4" />
              Quản lý câu hỏi
            </Link>
            <Link
              href="/exams"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#F2A60C]/50 bg-[#F2A60C]/15 px-3.5 py-2 text-xs font-semibold text-[#F2A60C] transition hover:bg-[#F2A60C]/25"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Ma trận &amp; Sinh đề
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {loading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-200/70" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-200/70" />
          <span className="sr-only">Đang tải…</span>
        </div>
      )}

      {!loading && questions.length === 0 && (
        <Alert kind="warn">
          Chưa có câu hỏi nào trong ngân hàng. Hãy{" "}
          <Link href="/questions" className="font-semibold underline">
            vào Quản lý câu hỏi để nhập file .tex
          </Link>{" "}
          để bắt đầu.
        </Alert>
      )}

      {!loading && questions.length > 0 && (
        <div className="space-y-6">
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
              <button type="button" onClick={resetScope} className="ml-1.5 font-semibold underline">
                Xóa bộ lọc
              </button>{" "}
              để xem toàn bộ ngân hàng.
            </Alert>
          )}

          {s.total > 0 && (
            <>
              {/* ---------- Bảng chỉ số KPI ---------- */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Tổng số câu hỏi"
                  value={s.total}
                  icon={BookOpen}
                  tone="burgundy"
                  hint={scopeActive ? `Trong phạm vi: ${scopeLabel}` : "Toàn bộ ngân hàng câu hỏi"}
                />
                <KpiCard
                  label="Đã gắn ID hợp lệ"
                  value={s.valid}
                  icon={CheckCircle2}
                  tone="emerald"
                  progress={pct(s.valid, s.total)}
                  hint={`${pct(s.valid, s.total)}% tổng số câu`}
                />
                <KpiCard
                  label="Chưa gắn ID / ID lỗi"
                  value={s.invalid}
                  icon={Tag}
                  tone="amber"
                  hint={s.invalid ? "Cần bổ sung ID để vào thống kê" : "Tất cả câu đều có ID hợp lệ"}
                />
                <KpiCard
                  label="Dạng toán đã có câu"
                  value={coveredForms}
                  suffix={`/ ${forms.length}`}
                  icon={Layers}
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 sm:text-sm">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Có <strong>{s.invalid}</strong> câu chưa gắn ID hợp lệ nên chưa được tính vào thống kê Mức độ, Chương và Dạng toán.
                    </span>
                  </div>
                  <Link href="/questions" className="font-semibold text-[#4A0E17] underline underline-offset-2 hover:opacity-80">
                    Bổ sung ID ngay →
                  </Link>
                </div>
              )}

              {/* ---------- Mức độ + Loại × Mức ---------- */}
              <div className="grid gap-6 xl:grid-cols-5">
                <Card className="xl:col-span-2">
                  <SectionTitle title="Phân bố theo mức độ" hint={`${s.valid} câu đã gắn ID`} />
                  <div className="flex flex-col items-center gap-6 sm:flex-row">
                    <LevelDonut counts={s.byLevel} center={String(s.valid)} caption="câu đã gắn ID" />
                    <div className="w-full space-y-3">
                      {LEVELS.map((l) => (
                        <div key={l}>
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-2">
                              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${LEVEL_CHIP[l]}`}>{l}</span>
                              <span className="text-slate-600">{LEVEL_MAP[l]}</span>
                            </span>
                            <span className="tabular-nums font-semibold text-slate-900">
                              {s.byLevel[l]}
                              <span className="ml-1 font-normal text-slate-400">({pct(s.byLevel[l], s.valid)}%)</span>
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
                    <div className="mt-5 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Mức 1–2 (NB/TH): <strong className="text-slate-900">{lowPct}%</strong> ({low} câu)
                        </span>
                        <span>
                          Mức 3–4 (VD/VDC): <strong className="text-slate-900">{100 - lowPct}%</strong> ({high} câu)
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="bg-emerald-500 transition-[width] duration-500" style={{ width: `${lowPct}%` }} />
                        <div className="bg-[#4A0E17] transition-[width] duration-500" style={{ width: `${100 - lowPct}%` }} />
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-400">Tham chiếu chuẩn đề 70/30 (tính trên các câu đã gắn ID)</p>
                    </div>
                  )}
                </Card>

                <Card className="xl:col-span-3 overflow-x-auto">
                  <SectionTitle title="Ma trận Loại câu × Mức độ" hint={`${s.types.length} loại câu`} />
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="pb-2.5">Loại câu</th>
                        {LEVELS.map((l) => (
                          <th key={l} className="pb-2.5 text-right">{l}</th>
                        ))}
                        <th className="pb-2.5 text-right" title="Chưa gắn ID hợp lệ">Chưa ID</th>
                        <th className="pb-2.5 text-right">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.types.map((t) => (
                        <tr key={t.abbr} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                          <td className="py-3 pr-3">
                            <span className="font-semibold text-slate-800">{typeName(t.abbr)}</span>
                            <span className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${TYPE_BADGE[t.abbr] ?? "bg-slate-100 text-slate-600"}`}>
                              {t.abbr}
                            </span>
                          </td>
                          {LEVELS.map((l) => (
                            <td key={l} className="py-3 text-right tabular-nums text-slate-600">
                              {t.levels[l] || <span className="text-slate-300">–</span>}
                            </td>
                          ))}
                          <td className={`py-3 text-right tabular-nums ${t.noId ? "font-semibold text-amber-600" : "text-slate-300"}`}>
                            {t.noId || "–"}
                          </td>
                          <td className="py-3 text-right tabular-nums font-bold text-slate-900">{t.total}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-[#4A0E17]/[0.03] text-slate-900">
                        <td className="py-3 pr-3 font-bold text-[#4A0E17]">Tổng cộng</td>
                        {LEVELS.map((l) => (
                          <td key={l} className="py-3 text-right tabular-nums font-bold">{s.byLevel[l]}</td>
                        ))}
                        <td className="py-3 text-right tabular-nums font-bold text-amber-700">{s.invalid}</td>
                        <td className="py-3 text-right tabular-nums font-bold text-[#4A0E17]">{s.total}</td>
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
                      <p className="text-sm text-slate-600">
                        <strong className="text-xl font-bold tabular-nums text-slate-900">{coveredForms}</strong>
                        <span className="text-slate-400"> / {forms.length} dạng đã có câu hỏi</span>
                      </p>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#4A0E17] to-[#F2A60C] transition-[width] duration-500"
                          style={{ width: `${pct(coveredForms, forms.length)}%` }}
                        />
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Còn <strong className="text-slate-700">{emptyForms.length}</strong> dạng chưa có câu hỏi — mở danh sách bên dưới để rà soát và bổ sung.
                      </p>
                    </div>
                  </div>

                  {emptyForms.length > 0 && (
                    <details className="group mt-5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-sm open:bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-[#4A0E17]">
                        Xem {emptyForms.length} dạng chưa có câu hỏi
                        <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▾</span>
                      </summary>
                      <ul className="mt-3 max-h-72 space-y-1 overflow-auto pr-1">
                        {emptyForms.map((n) => {
                          const p = parseNodeId(n.id);
                          return (
                            <li
                              key={n.id}
                              className="flex items-baseline gap-2 rounded-lg border-t border-slate-100 px-2 py-1.5 first:border-t-0 hover:bg-slate-50"
                            >
                              <span className="w-24 shrink-0 font-mono text-[11px] text-slate-400">{n.id}</span>
                              <span className="min-w-0 flex-1 text-slate-700">
                                <InlineLatex content={n.title} />
                                <span className="text-xs text-slate-400"> · <InlineLatex content={lessonTitleOf(n.id)} /></span>
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
                    hint={topChapters.length ? (scopeActive ? scopeLabel : "Top 6") : undefined}
                  />
                  {topChapters.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">Chưa có mục lục (Lớp / Chương).</p>
                  ) : (
                    <ol className="space-y-3.5">
                      {topChapters.map((c, i) => (
                        <li key={c.id}>
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                                  i === 0
                                    ? "bg-[#F2A60C] text-slate-900"
                                    : i === 1
                                      ? "bg-slate-200 text-slate-700"
                                      : i === 2
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {i + 1}
                              </span>
                              <span className="truncate leading-normal font-medium text-slate-700">
                                <InlineLatex content={c.title} />
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums font-bold text-slate-900">{c.total}</span>
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
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold tracking-tight text-slate-900">Chi tiết theo chương</h2>
                    {scopeActive && (
                      <span className="rounded-full bg-[#4A0E17]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#4A0E17]">
                        {scopeLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {LEVELS.map((l) => (
                      <span key={l} className="flex items-center gap-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${LEVEL_BAR[l]}`} /> {l}
                      </span>
                    ))}
                  </div>
                </div>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="pb-2.5">Chương</th>
                      {LEVELS.map((l) => (
                        <th key={l} className="pb-2.5 text-right">{l}</th>
                      ))}
                      <th className="pb-2.5 text-right">Tổng</th>
                      <th className="w-44 pb-2.5 pl-4">Cơ cấu mức độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grades.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
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
    </div>
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
        <tr className="border-t border-slate-200 bg-slate-50/90">
          <td colSpan={7} className="py-2 pl-2 text-[11px] font-bold uppercase tracking-wider text-[#4A0E17]">
            <InlineLatex content={gradeTitle} />
          </td>
        </tr>
      )}
      {chapters.map((c) => {
        const lv = levels.get(c.id) ?? zero();
        return (
          <tr
            key={c.id}
            className={`border-t border-slate-100 transition-colors ${
              c.id === highlightId ? "bg-[#F2A60C]/10" : "hover:bg-slate-50/80"
            }`}
          >
            <td className="py-2.5 pr-2 font-medium text-slate-700"><InlineLatex content={c.title} /></td>
            {LEVELS.map((l) => (
              <td key={l} className="py-2.5 text-right tabular-nums text-slate-600">
                {lv[l] || <span className="text-slate-300">–</span>}
              </td>
            ))}
            <td className="py-2.5 text-right tabular-nums font-bold text-slate-900">{sum(lv)}</td>
            <td className="py-2.5 pl-4">
              <LevelBar counts={lv} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
