"use client";

import React, { useMemo, useState } from "react";
import { Plus, Layers } from "lucide-react";
import { Modal } from "@/components/question-bank/Modal";
import { SidebarTree } from "@/components/question-bank/SidebarTree";
import { LatexRenderer } from "@/components/question-bank/LatexRenderer";
import type { DifficultyLevel, QuestionItem, TreeNode } from "@/components/question-bank/types";
import { belongsTo, findNode, withoutPending } from "@/lib/tree";
import { SLOT_TYPES, normType, type SlotType } from "./types";

interface Props {
  tree: TreeNode[];
  questions: QuestionItem[];
  usedQuestionIds: Set<string>;
  currentId: string | null;
  defaultType: SlotType;
  allowChangeType?: boolean;
  mode?: "pick-row" | "add";
  onApply: (result: {
    topicId: string | null;
    type: SlotType;
    counts: Record<DifficultyLevel, number>;
  }) => void;
  onClose: () => void;
}

const LEVELS: { lv: DifficultyLevel; label: string; badge: string }[] = [
  { lv: 1, label: "Mức 1 (NB)", badge: "bg-sky-100 text-sky-800" },
  { lv: 2, label: "Mức 2 (TH)", badge: "bg-emerald-100 text-emerald-800" },
  { lv: 3, label: "Mức 3 (VD)", badge: "bg-amber-100 text-amber-800" },
  { lv: 4, label: "Mức 4 (VDC)", badge: "bg-[#4A0E17]/15 text-[#4A0E17]" },
];

const ZERO_COUNTS: Record<DifficultyLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

export const TopicPickerModal: React.FC<Props> = ({
  tree,
  questions,
  usedQuestionIds,
  currentId,
  defaultType,
  allowChangeType = false,
  mode = "pick-row",
  onApply,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(currentId);
  const [slotType, setSlotType] = useState<SlotType>(defaultType);
  const [counts, setCounts] = useState<Record<DifficultyLevel, number>>(ZERO_COUNTS);
  const [levelFilter, setLevelFilter] = useState<0 | DifficultyLevel>(0);

  const selectedNode = useMemo(
    () => (selectedId ? findNode(tree, selectedId) : undefined),
    [tree, selectedId],
  );

  // Các câu hỏi khả dụng (đúng kiểu, chưa dùng ở dòng khác, thuộc mục đang chọn)
  const matchingQuestions = useMemo(
    () =>
      questions.filter(
        (q) =>
          normType(q.type) === slotType &&
          !usedQuestionIds.has(q.id) &&
          (!selectedId || belongsTo(q, selectedId)),
      ),
    [questions, slotType, usedQuestionIds, selectedId],
  );

  const byLevel = useMemo(() => {
    const map: Record<DifficultyLevel, QuestionItem[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const q of matchingQuestions) {
      if (q.level) map[q.level].push(q);
    }
    return map;
  }, [matchingQuestions]);

  const previewList = useMemo(
    () => (levelFilter === 0 ? matchingQuestions : byLevel[levelFilter]),
    [matchingQuestions, byLevel, levelFilter],
  );

  const totalRequested = counts[1] + counts[2] + counts[3] + counts[4];

  const handleSelectFolder = (id: string) => {
    setSelectedId(id === "all" ? null : id);
    setCounts(ZERO_COUNTS);
    setLevelFilter(0);
  };

  const handleTypeChange = (t: SlotType) => {
    setSlotType(t);
    setCounts(ZERO_COUNTS);
    setLevelFilter(0);
  };

  const updateCount = (lv: DifficultyLevel, rawVal: string) => {
    const max = byLevel[lv].length;
    const n = Math.max(0, Math.min(max, Number(rawVal) || 0));
    setCounts((prev) => ({ ...prev, [lv]: n }));
  };

  const primaryLabel =
    totalRequested > 0
      ? mode === "add"
        ? `THÊM ${totalRequested} CÂU VÀO MA TRẬN`
        : `ÁP DỤNG (${totalRequested} CÂU)`
      : mode === "add"
        ? "THÊM 1 DÒNG TRỐNG"
        : "CHỌN DẠNG BÀI NÀY";

  return (
    <Modal
      title={mode === "add" ? "Thêm dạng toán vào ma trận" : "Chọn dạng bài & số câu theo mức độ"}
      widthClass="max-w-5xl"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {mode === "pick-row" && (
              <button
                type="button"
                onClick={() => onApply({ topicId: null, type: slotType, counts: ZERO_COUNTS })}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Bỏ chọn dạng bài
              </button>
            )}
            <span className="text-gray-500">
              Nhập số câu ở từng mức độ để tự động rút ngẫu nhiên, hoặc để 0 để chỉ gắn dạng bài.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
            >
              HỦY
            </button>
            <button
              type="button"
              onClick={() => onApply({ topicId: selectedId, type: slotType, counts })}
              className="flex items-center gap-1.5 rounded bg-[#4A0E17] px-4 py-1.5 font-bold text-white transition hover:bg-[#5d1420]"
            >
              {mode === "add" && <Plus className="h-3.5 w-3.5" />}
              {primaryLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Cột trái: Cây mục lục */}
        <div className="lg:col-span-5">
          <SidebarTree
            readOnly
            treeData={withoutPending(tree)}
            selectedFolderId={selectedId ?? "all"}
            onSelectFolder={handleSelectFolder}
            maxHeightClass="max-h-[58vh]"
          />
        </div>

        {/* Cột phải: Số câu hiện có theo mức độ + nhập số câu cần lấy + xem danh sách */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Dạng toán / Mục đang chọn</div>
                <div className="mt-0.5 truncate text-sm font-bold text-[#4A0E17]">
                  {selectedNode ? selectedNode.title : "Toàn bộ ngân hàng"}
                </div>
                {selectedNode && <div className="font-mono text-[11px] text-gray-500">{selectedNode.id}</div>}
              </div>

              {allowChangeType ? (
                <div className="flex flex-wrap gap-1">
                  {SLOT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`rounded px-2.5 py-1 text-[11px] font-bold transition ${
                        slotType === t
                          ? "bg-[#F2A60C] text-slate-900"
                          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="rounded bg-[#F2A60C] px-2.5 py-1 text-[11px] font-bold text-slate-900">
                  {slotType}
                </span>
              )}
            </div>

            {/* Bảng nhập số câu cần lấy theo từng mức độ */}
            <div className="mt-3 overflow-hidden rounded border border-gray-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-[#4A0E17] text-white">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-bold">Mức độ</th>
                    <th className="px-2.5 py-1.5 text-right font-bold">Hiện có (chưa dùng)</th>
                    <th className="w-32 px-2.5 py-1.5 text-right font-bold">Số câu cần lấy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {LEVELS.map(({ lv, label, badge }) => {
                    const avail = byLevel[lv].length;
                    return (
                      <tr key={lv} className="hover:bg-gray-50/70">
                        <td className="px-2.5 py-1.5">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${badge}`}>{label}</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums text-gray-700">
                          {avail} câu
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <input
                            type="number"
                            min={0}
                            max={avail}
                            disabled={avail === 0}
                            value={counts[lv]}
                            onChange={(e) => updateCount(lv, e.target.value)}
                            aria-label={`Số câu ${label}`}
                            className="h-7 w-20 rounded border border-gray-300 px-2 text-right font-semibold tabular-nums focus:border-[#4A0E17] focus:outline-hidden disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50 font-bold text-[#4A0E17]">
                  <tr>
                    <td className="px-2.5 py-1.5">Tổng cộng</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{matchingQuestions.length} câu</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{totalRequested} câu</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Danh sách câu hỏi hiện có theo mức độ */}
          <div className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                <Layers className="h-3.5 w-3.5 text-[#4A0E17]" />
                Câu hỏi hiện có ({previewList.length})
              </span>
              <div className="flex flex-wrap gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setLevelFilter(0)}
                  className={`rounded px-2 py-0.5 font-semibold ${
                    levelFilter === 0 ? "bg-[#4A0E17] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Tất cả ({matchingQuestions.length})
                </button>
                {LEVELS.map(({ lv }) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => setLevelFilter(lv)}
                    className={`rounded px-2 py-0.5 font-semibold ${
                      levelFilter === lv ? "bg-[#4A0E17] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    M{lv} ({byLevel[lv].length})
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[28vh] space-y-2 overflow-y-auto p-2.5">
              {previewList.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">
                  Không có câu hỏi khả dụng nào thuộc mục và mức độ này.
                </p>
              ) : (
                previewList.map((q) => (
                  <div key={q.id} className="rounded border border-gray-200 p-2 text-xs hover:bg-gray-50">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-[#4A0E17]">{q.code}</span>
                      <span className="rounded bg-[#EAB308] px-1.5 py-0.5 font-bold text-slate-900">
                        {q.level ? `Mức ${q.level}` : "Chưa mức"}
                      </span>
                    </div>
                    <LatexRenderer content={q.content} className="line-clamp-2 text-[11.5px]" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
