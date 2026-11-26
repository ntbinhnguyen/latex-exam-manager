"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PlusCircle, RotateCcw, Search } from "lucide-react";
import { useQuestionBank } from "@/lib/use-question-bank";
import { belongsTo, flattenTree, withoutPending } from "@/lib/tree";
import { nodeKey, parseNodeId } from "@/lib/qid";
import { loadJson } from "@/lib/storage";
import { InlineLatex } from "@/components/question-bank/LatexRenderer";
import type { DifficultyLevel } from "@/components/question-bank/types";
import {
  CURRENT_KEY,
  SLOT_TYPES,
  blankRow,
  newRowId,
  normType,
  publishMatrixRows,
  slotTypeFromAbbr,
  syncRowLevel,
  type MatrixRow,
  type SlotType,
} from "./types";

type Lv = DifficultyLevel;
type LvMap = Record<Lv, number>;

const ZERO_LV: LvMap = { 1: 0, 2: 0, 3: 0, 4: 0 };

const DEFAULT_GRADES = [
  { id: "T0", label: "Lớp 10" },
  { id: "T1", label: "Lớp 11" },
  { id: "T2", label: "Lớp 12" },
];

function shortChapterLabel(id: string, title: string): string {
  const m = /\.C(\d+)$/i.exec(id);
  if (m) return `Chương ${Number(m[1])}`;
  return title;
}

interface FormRowItem {
  id: string;
  title: string;
  lessonTitle: string;
  chapterId: string;
  slotType: SlotType;
  avail: LvMap;
}

export function MatrixPageBuilder() {
  const router = useRouter();
  const bank = useQuestionBank();
  const { questions, tree, nodeMap } = bank;

  const cleanTree = useMemo(() => withoutPending(tree), [tree]);
  const flat = useMemo(() => flattenTree(cleanTree), [cleanTree]);

  // Danh sách Lớp (luôn có Lớp 10, 11, 12 như ảnh mẫu + bổ sung nếu cây có mã lớp khác)
  const grades = useMemo(() => {
    const map = new Map<string, string>(DEFAULT_GRADES.map((g) => [g.id, g.label]));
    flat
      .filter((n) => n.kind === "grade")
      .forEach((g) => {
        if (!map.has(g.id)) map.set(g.id, g.title);
      });
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [flat]);

  const [selectedGrade, setSelectedGrade] = useState<string>("T2");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"ALL" | SlotType>("ALL");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, LvMap>>({});
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [initializedGrade, setInitializedGrade] = useState(false);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  // Khi cây mục lục tải xong lần đầu: chọn lớp có dữ liệu (ưu tiên Lớp 12 - T2) và tích sẵn Chương đầu tiên
  useEffect(() => {
    if (initializedGrade) return;
    const chaptersInTree = flat.filter((n) => n.kind === "chapter");
    if (chaptersInTree.length === 0) return;
    const hasT2 = chaptersInTree.some((c) => c.id.startsWith("T2."));
    const initialGrade = hasT2 ? "T2" : chaptersInTree[0].id.split(".")[0];
    const firstCh = chaptersInTree.find((c) => c.id.startsWith(`${initialGrade}.`));
    setSelectedGrade(initialGrade);
    if (firstCh) setSelectedChapters(new Set([firstCh.id]));
    setInitializedGrade(true);
  }, [flat, initializedGrade]);

  // Danh sách Chương thuộc Lớp đang chọn
  const chapters = useMemo(
    () =>
      flat
        .filter((n) => n.kind === "chapter" && n.id.startsWith(`${selectedGrade}.`))
        .map((c) => ({
          id: c.id,
          shortLabel: shortChapterLabel(c.id, c.title),
          fullTitle: c.title,
        })),
    [flat, selectedGrade],
  );

  const handleGradeChange = (gradeId: string) => {
    setSelectedGrade(gradeId);
    const chs = flat.filter((n) => n.kind === "chapter" && n.id.startsWith(`${gradeId}.`));
    setSelectedChapters(chs.length > 0 ? new Set([chs[0].id]) : new Set());
  };

  const toggleChapter = (chId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  // Tính sẵn số câu hiện có cho từng dạng (hoặc mục loại nếu bài chưa chia dạng)
  const allFormItems = useMemo<FormRowItem[]>(() => {
    // Gom số câu theo nodeId và mức độ để bảng chạy mượt với hàng nghìn câu
    const countsByNode = new Map<string, LvMap>();
    for (const q of questions) {
      if (!q.level) continue;
      const p = parseNodeId(q.code);
      if (!p) continue;
      const keys = [nodeKey(p.parts, "type")];
      if (p.parts.form) keys.push(nodeKey(p.parts, "form"));
      for (const k of keys) {
        if (!k) continue;
        const cur = countsByNode.get(k) ?? { 1: 0, 2: 0, 3: 0, 4: 0 };
        cur[q.level]++;
        countsByNode.set(k, cur);
      }
    }

    const items: FormRowItem[] = [];
    for (const n of flat) {
      if (n.kind !== "form" && !(n.kind === "type" && (!n.children || n.children.length === 0))) continue;
      const parsed = parseNodeId(n.id);
      if (!parsed) continue;
      const chapterId = nodeKey(parsed.parts, "chapter");
      const lessonId = nodeKey(parsed.parts, "lesson");
      const avail = countsByNode.get(n.id) ?? ZERO_LV;
      if (n.kind === "type" && avail[1] + avail[2] + avail[3] + avail[4] === 0) continue;

      items.push({
        id: n.id,
        title: n.title,
        lessonTitle: nodeMap.get(lessonId)?.title ?? parsed.parts.lesson ?? "",
        chapterId,
        slotType: slotTypeFromAbbr(parsed.parts.type),
        avail,
      });
    }
    return items;
  }, [flat, questions, nodeMap]);

  // Lọc các dòng hiển thị theo Lớp + Chương đã tích + Kiểu + Từ khóa
  const visibleRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return allFormItems.filter((item) => {
      if (!selectedChapters.has(item.chapterId)) return false;
      if (typeFilter !== "ALL" && item.slotType !== typeFilter) return false;
      if (
        kw &&
        !item.id.toLowerCase().includes(kw) &&
        !item.title.toLowerCase().includes(kw) &&
        !item.lessonTitle.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
  }, [allFormItems, selectedChapters, typeFilter, search]);

  const allItemMap = useMemo(() => new Map(allFormItems.map((it) => [it.id, it])), [allFormItems]);

  const setCellCount = (rowId: string, lv: Lv, raw: string, maxAvail: number) => {
    const clean = raw.trim();
    const num = clean === "" ? 0 : Math.max(0, Math.min(maxAvail, Math.floor(Number(clean) || 0)));
    setPicked((prev) => {
      const cur = prev[rowId] ?? ZERO_LV;
      const nextRow: LvMap = { ...cur, [lv]: num };
      if (nextRow[1] + nextRow[2] + nextRow[3] + nextRow[4] === 0) {
        const copy = { ...prev };
        delete copy[rowId];
        return copy;
      }
      return { ...prev, [rowId]: nextRow };
    });
  };

  // Tổng số câu đã nhập trên toàn bộ các chương/lớp
  const totalSelected = useMemo(() => {
    let total = 0;
    let formsCount = 0;
    for (const lvMap of Object.values(picked)) {
      const s = lvMap[1] + lvMap[2] + lvMap[3] + lvMap[4];
      if (s > 0) {
        total += s;
        formsCount++;
      }
    }
    return { total, formsCount };
  }, [picked]);

  const handleAddToMatrix = () => {
    if (totalSelected.total === 0) {
      notify("Vui lòng nhập số câu cần lấy (lớn hơn 0) ở ít nhất một dạng toán.");
      return;
    }

    const existing = loadJson<MatrixRow[] | null>(CURRENT_KEY, null);
    const isExistingAllBlank =
      !existing || existing.length === 0 || existing.every((r) => !r.questionId && !r.topicId);
    const baseRows: MatrixRow[] = replaceExisting || isExistingAllBlank ? [] : existing;
    const usedIds = new Set(baseRows.filter((r) => r.questionId).map((r) => r.questionId as string));

    const created: MatrixRow[] = [];
    for (const [rowId, lvMap] of Object.entries(picked)) {
      const meta = allItemMap.get(rowId);
      const parsed = parseNodeId(rowId);
      const slotType = meta?.slotType ?? slotTypeFromAbbr(parsed?.parts.type);

      ([1, 2, 3, 4] as Lv[]).forEach((lv) => {
        const need = lvMap[lv];
        if (need <= 0) return;
        const pool = questions.filter(
          (q) => !usedIds.has(q.id) && q.level === lv && belongsTo(q, rowId),
        );
        for (let i = 0; i < need; i++) {
          if (pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            const chosen = pool.splice(idx, 1)[0];
            usedIds.add(chosen.id);
            created.push({
              id: newRowId(),
              type: slotType,
              topicId: rowId,
              level: lv,
              questionId: chosen.id,
            });
          } else {
            created.push(syncRowLevel({ ...blankRow(slotType), topicId: rowId, level: lv }));
          }
        }
      });
    }

    const combined = [...baseRows, ...created].sort(
      (a, b) => SLOT_TYPES.indexOf(a.type) - SLOT_TYPES.indexOf(b.type),
    );
    publishMatrixRows(combined);
    router.push("/exams");
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex max-w-md items-start gap-2 rounded-lg bg-[#4A0E17] px-4 py-2.5 text-xs text-white shadow-xl sm:text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Khung chọn Lớp & Chương theo đúng bố cục ảnh mẫu */}
      <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3">
          {/* Hàng 1: Radio Lớp 10 / Lớp 11 / Lớp 12 */}
          <div className="flex flex-wrap items-center gap-6 pl-4 sm:pl-16">
            {grades.map((g) => (
              <label key={g.id} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800 select-none">
                <input
                  type="radio"
                  name="matrix-grade"
                  checked={selectedGrade === g.id}
                  onChange={() => handleGradeChange(g.id)}
                  className="h-4 w-4 accent-[#4A0E17]"
                />
                <span>{g.label}</span>
              </label>
            ))}
          </div>

          {/* Hàng 2: Checkbox các Chương thuộc Lớp đang chọn */}
          <div className="flex flex-wrap items-center justify-between gap-3 pl-2 sm:pl-6">
            <div className="flex flex-wrap items-center gap-5">
              {chapters.length === 0 ? (
                <span className="text-xs italic text-slate-400">Chưa có dữ liệu chương cho {grades.find((g) => g.id === selectedGrade)?.label ?? selectedGrade}.</span>
              ) : (
                chapters.map((ch) => (
                  <label
                    key={ch.id}
                    title={ch.fullTitle}
                    className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChapters.has(ch.id)}
                      onChange={() => toggleChapter(ch.id)}
                      className="h-4 w-4 rounded accent-[#4A0E17]"
                    />
                    <span>{ch.shortLabel}</span>
                  </label>
                ))
              )}
              {chapters.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => setSelectedChapters(new Set(chapters.map((c) => c.id)))}
                    className="underline hover:text-[#4A0E17]"
                  >
                    Chọn hết
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedChapters(new Set())}
                    className="underline hover:text-[#4A0E17]"
                  >
                    Bỏ chọn
                  </button>
                </div>
              )}
            </div>

            {/* Bộ lọc phụ gọn nhẹ: Kiểu câu hỏi + Tìm kiếm nhanh */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5 text-xs">
                {(["ALL", ...SLOT_TYPES] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`rounded px-2 py-1 font-medium transition ${
                      typeFilter === t ? "bg-[#4A0E17] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t === "ALL" ? "Tất cả" : t}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lọc ID / tên dạng / bài..."
                  className="h-8 w-48 rounded border border-slate-300 pl-8 pr-2.5 text-xs focus:border-[#4A0E17] focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bảng ma trận dạng toán theo đúng cấu trúc ảnh mẫu */}
        <div className="mt-4 max-h-[calc(100vh-18rem)] min-h-[280px] overflow-auto border border-slate-400">
          <table className="w-full min-w-[920px] border-collapse text-xs sm:text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-800 shadow-2xs">
              <tr>
                <th rowSpan={2} className="w-40 border border-slate-400 px-2.5 py-2 text-center font-semibold">
                  ID
                </th>
                <th rowSpan={2} className="border border-slate-400 px-3 py-2 text-center font-semibold">
                  Tên dạng toán
                </th>
                <th colSpan={4} className="border border-slate-400 px-2 py-1.5 text-center font-semibold">
                  Số câu hiện có
                </th>
                <th colSpan={4} className="border border-slate-400 px-2 py-1.5 text-center font-semibold">
                  Số câu cần lấy
                </th>
                <th rowSpan={2} className="w-64 border border-slate-400 px-3 py-2 text-center font-semibold">
                  Tên bài
                </th>
              </tr>
              <tr>
                {(["M1", "M2", "M3", "M4"] as const).map((m) => (
                  <th key={`avail-${m}`} className="w-12 border border-slate-400 py-1 text-center font-medium">
                    {m}
                  </th>
                ))}
                {(["M1", "M2", "M3", "M4"] as const).map((m) => (
                  <th key={`pick-${m}`} className="w-14 border border-slate-400 py-1 text-center font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border border-slate-300 py-10 text-center text-sm text-slate-400">
                    {selectedChapters.size === 0
                      ? "Hãy tích chọn ít nhất một Chương ở phía trên để hiển thị danh sách dạng toán."
                      : "Không có dạng toán nào khớp với bộ lọc hiện tại."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const rowPicked = picked[row.id] ?? ZERO_LV;
                  const hasPicked = rowPicked[1] + rowPicked[2] + rowPicked[3] + rowPicked[4] > 0;
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${hasPicked ? "bg-amber-50/70" : "hover:bg-slate-50"}`}
                    >
                      <td className="border border-slate-300 px-2 py-1.5 font-mono text-xs whitespace-nowrap text-slate-800">
                        {row.id}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 leading-normal text-slate-800">
                        <InlineLatex content={row.title} />
                      </td>
                      {([1, 2, 3, 4] as Lv[]).map((lv) => (
                        <td
                          key={`a-${lv}`}
                          className={`border border-slate-300 px-1.5 py-1.5 text-center tabular-nums ${
                            row.avail[lv] > 0 ? "font-semibold text-slate-900" : "text-slate-400"
                          }`}
                        >
                          {row.avail[lv]}
                        </td>
                      ))}
                      {([1, 2, 3, 4] as Lv[]).map((lv) => {
                        const max = row.avail[lv];
                        const val = rowPicked[lv];
                        return (
                          <td
                            key={`p-${lv}`}
                            className={`border border-slate-300 p-0.5 text-center ${max === 0 ? "bg-slate-50/80" : ""}`}
                          >
                            <input
                              type="number"
                              min={0}
                              max={max}
                              disabled={max === 0}
                              value={val > 0 ? val : ""}
                              onChange={(e) => setCellCount(row.id, lv, e.target.value, max)}
                              aria-label={`Số câu cần lấy ${row.id} M${lv}`}
                              className={`h-7 w-full rounded px-1 text-center font-semibold tabular-nums focus:outline-hidden focus:ring-1 focus:ring-[#4A0E17] disabled:cursor-not-allowed disabled:bg-transparent ${
                                val > 0 ? "bg-[#F2A60C]/25 text-[#4A0E17]" : "bg-transparent text-slate-800"
                              }`}
                            />
                          </td>
                        );
                      })}
                      <td className="border border-slate-300 px-2.5 py-1.5 leading-normal text-slate-700">
                        <InlineLatex content={row.lessonTitle} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh hành động dưới bảng */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span>
              Đã chọn: <strong className="text-sm text-[#4A0E17]">{totalSelected.total}</strong> câu ({totalSelected.formsCount} dạng toán)
            </span>
            {totalSelected.total > 0 && (
              <button
                type="button"
                onClick={() => setPicked({})}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3 w-3" /> Xóa số đã nhập
              </button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-600 select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="accent-[#4A0E17]"
              />
              <span>Tạo đề mới (thay thế các dòng cũ đang có ở trang Sinh đề)</span>
            </label>
          </div>

          <button
            type="button"
            onClick={handleAddToMatrix}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-400 bg-[#4A0E17] px-5 text-xs font-bold tracking-wide text-white shadow-xs transition hover:bg-[#5d1420]"
          >
            <PlusCircle className="h-4 w-4 text-[#F2A60C]" />
            Thêm vào ma trận{totalSelected.total > 0 ? ` (${totalSelected.total} câu)` : ""}
          </button>
        </div>
      </section>
    </div>
  );
}
