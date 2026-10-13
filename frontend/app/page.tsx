"use client";
import { useMemo } from "react";
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

const zero = (): LevelCounts => ({ M1: 0, M2: 0, M3: 0, M4: 0 });
const sum = (c: LevelCounts) => c.M1 + c.M2 + c.M3 + c.M4;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const typeName = (abbr: string) => TYPE_LABEL[abbr] ?? "Loại khác";

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

function LevelBar({ counts }: { counts: LevelCounts }) {
  const total = sum(counts);
  if (!total) return <div className="h-2 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
      {LEVELS.map((l) =>
        counts[l] ? (
          <div key={l} className={LEVEL_BAR[l]} style={{ width: `${(counts[l] / total) * 100}%` }} title={`${LEVEL_MAP[l]}: ${counts[l]}`} />
        ) : null,
      )}
    </div>
  );
}

export default function Dashboard() {
  const bank = useQuestionBank();
  const { questions, tree, nodeMap } = bank;
  // hook có thể chưa tải xong dữ liệu: tránh nháy thông báo "chưa có câu hỏi"
  const loading = Boolean((bank as { loading?: boolean }).loading);

  const s = useMemo(() => computeStats(questions), [questions]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const grades = flat.filter((n) => n.kind === "grade");
  const forms = flat.filter((n) => n.kind === "form");
  const emptyForms = forms.filter((n) => !s.nodeCount.get(n.id));
  const coveredForms = forms.length - emptyForms.length;

  const max = Math.max(1, ...LEVELS.map((l) => s.byLevel[l]));
  const low = s.byLevel.M1 + s.byLevel.M2;
  const high = s.byLevel.M3 + s.byLevel.M4;

  const lessonTitleOf = (formId: string): string => {
    const p = parseNodeId(formId);
    return p ? (nodeMap.get(nodeKey(p.parts, "lesson"))?.title ?? "") : "";
  };

  return (
    <>
      <PageHeader title="Tổng quan" desc="Thống kê ngân hàng câu hỏi theo ID mới (Loại · Mức · Lớp · Chương · Bài · Dạng)" />
      {loading && <p className="text-sm text-slate-500">Đang tải…</p>}
      {!loading && s.total === 0 && (
        <Alert kind="warn">
          Chưa có câu hỏi nào. Hãy <Link href="/import" className="font-medium underline">nhập file .tex</Link> để bắt đầu.
        </Alert>
      )}

      {!loading && s.total > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <div className="text-sm text-slate-500">Tổng số câu hỏi</div>
              <div className="mt-1 text-3xl font-semibold">{s.total}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-500">Đã gắn ID hợp lệ</div>
              <div className="mt-1 text-3xl font-semibold">{s.valid}</div>
              <div className="mt-0.5 text-xs text-slate-400">{pct(s.valid, s.total)}% tổng số câu</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-500">Chưa gắn ID / ID lỗi</div>
              <div className={`mt-1 text-3xl font-semibold ${s.invalid ? "text-amber-600" : ""}`}>{s.invalid}</div>
            </Card>
            <Card>
              <div className="text-sm text-slate-500">Dạng toán đã có câu</div>
              <div className="mt-1 text-3xl font-semibold">
                {coveredForms}
                <span className="text-lg font-normal text-slate-400"> / {forms.length}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{pct(coveredForms, forms.length)}% số dạng trên mục lục</div>
            </Card>
          </div>

          {s.invalid > 0 && (
            <Alert kind="warn">
              Có <strong>{s.invalid}</strong> câu chưa gắn ID hợp lệ nên chưa được tính vào thống kê Mức độ, Chương và Dạng toán.
              Mở câu hỏi trong ngân hàng và bấm “Gắn ID” để bổ sung.
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-medium">Theo mức độ</h2>
              <div className="space-y-3">
                {LEVELS.map((l) => (
                  <div key={l}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>
                        {l.replace("M", "Mức ")} – {LEVEL_MAP[l]}
                      </span>
                      <span className="font-medium">
                        {s.byLevel[l]} <span className="font-normal text-slate-400">({pct(s.byLevel[l], s.valid)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${LEVEL_BAR[l]}`} style={{ width: `${(s.byLevel[l] / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {s.valid > 0 && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  Mức 1–2: <strong>{pct(low, s.valid)}%</strong> · Mức 3–4: <strong>{pct(high, s.valid)}%</strong>
                  <span className="text-slate-400"> (chuẩn đề 70/30, tính trên câu đã gắn ID)</span>
                </p>
              )}
            </Card>

            <Card className="overflow-x-auto">
              <h2 className="mb-4 font-medium">Loại câu × Mức độ</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2">Loại câu</th>
                    {LEVELS.map((l) => (
                      <th key={l} className="pb-2 text-right">{l}</th>
                    ))}
                    <th className="pb-2 text-right" title="Chưa gắn ID hợp lệ">Chưa ID</th>
                    <th className="pb-2 text-right">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {s.types.map((t) => (
                    <tr key={t.abbr} className="border-t border-slate-100">
                      <td className="py-2">{typeName(t.abbr)}</td>
                      {LEVELS.map((l) => (
                        <td key={l} className="py-2 text-right">{t.levels[l]}</td>
                      ))}
                      <td className={`py-2 text-right ${t.noId ? "text-amber-600" : "text-slate-400"}`}>{t.noId}</td>
                      <td className="py-2 text-right font-semibold">{t.total}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-2">Tổng</td>
                    {LEVELS.map((l) => (
                      <td key={l} className="py-2 text-right">{s.byLevel[l]}</td>
                    ))}
                    <td className="py-2 text-right">{s.invalid}</td>
                    <td className="py-2 text-right">{s.total}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Theo chương</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {LEVELS.map((l) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${LEVEL_BAR[l]}`} /> {l}
                  </span>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Chương</th>
                  {LEVELS.map((l) => (
                    <th key={l} className="pb-2 text-right">{l}</th>
                  ))}
                  <th className="pb-2 text-right">Tổng</th>
                  <th className="w-40 pb-2 pl-4">Cơ cấu mức độ</th>
                </tr>
              </thead>
              <tbody>
                {grades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400">Chưa có mục lục (Lớp / Chương). Nạp file mục lục để xem thống kê theo chương.</td>
                  </tr>
                )}
                {grades.map((g) => (
                  <ChapterRows
                    key={g.id}
                    gradeTitle={g.title}
                    showGrade={grades.length > 1}
                    chapters={flat.filter((n) => n.kind === "chapter" && n.id.startsWith(`${g.id}.`))}
                    levels={s.chapterLevels}
                  />
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Độ phủ Dạng toán</h2>
              <span className="text-sm text-slate-500">
                {coveredForms} / {forms.length} dạng đã có câu · <strong>{emptyForms.length}</strong> dạng còn trống
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct(coveredForms, forms.length)}%` }} />
            </div>
            {emptyForms.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium text-indigo-700">Xem {emptyForms.length} dạng chưa có câu hỏi</summary>
                <ul className="mt-2 max-h-72 space-y-1 overflow-auto pr-2">
                  {emptyForms.map((n) => {
                    const p = parseNodeId(n.id);
                    return (
                      <li key={n.id} className="flex items-baseline gap-2 border-t border-slate-100 py-1">
                        <span className="w-24 shrink-0 font-mono text-[11px] text-slate-400">{n.id}</span>
                        <span className="min-w-0 flex-1">
                          {n.title}
                          <span className="text-xs text-slate-400"> · {lessonTitleOf(n.id)}</span>
                        </span>
                        {p?.parts.level && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{p.parts.level}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </Card>
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
}: {
  gradeTitle: string;
  showGrade: boolean;
  chapters: { id: string; title: string }[];
  levels: Map<string, LevelCounts>;
}) {
  return (
    <>
      {showGrade && (
        <tr className="border-t border-slate-200 bg-slate-50">
          <td colSpan={7} className="py-1.5 pl-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{gradeTitle}</td>
        </tr>
      )}
      {chapters.map((c) => {
        const lv = levels.get(c.id) ?? zero();
        return (
          <tr key={c.id} className="border-t border-slate-100">
            <td className="py-2 pr-2">{c.title}</td>
            {LEVELS.map((l) => (
              <td key={l} className="py-2 text-right">{lv[l]}</td>
            ))}
            <td className="py-2 text-right font-semibold">{sum(lv)}</td>
            <td className="py-2 pl-4">
              <LevelBar counts={lv} />
            </td>
          </tr>
        );
      })}
    </>
  );
}