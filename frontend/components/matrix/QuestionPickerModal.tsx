"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/question-bank/Modal";
import { LatexRenderer } from "@/components/question-bank/LatexRenderer";
import type { QuestionItem, TreeNode } from "@/components/question-bank/types";
import { belongsTo } from "@/lib/tree";
import { normType, rowLevel, type MatrixRow } from "./types";

interface Props {
  row: MatrixRow;
  rowNumber: number;
  questions: QuestionItem[];
  nodeMap: Map<string, TreeNode>;
  usedByOthers: Set<string>;
  onPick: (q: QuestionItem) => void;
  onClose: () => void;
}

const LIMIT = 100;

export const QuestionPickerModal: React.FC<Props> = ({ row, rowNumber, questions, nodeMap, usedByOthers, onPick, onClose }) => {
  const [term, setTerm] = useState("");
  const level = rowLevel(row); // mức độ theo Dạng toán (nếu đã chọn Dạng) hoặc mức người dùng chọn
  const hasConstraint = Boolean(row.topicId || level);
  const [strict, setStrict] = useState(true);

  const list = useMemo(() => {
    const lower = term.trim().toLowerCase();
    return questions.filter((q) => {
      if (normType(q.type) !== row.type) return false;
      if (usedByOthers.has(q.id)) return false;
      if (strict && row.topicId && !belongsTo(q, row.topicId)) return false;
      if (strict && level && q.level !== level) return false;
      if (lower && !q.code.toLowerCase().includes(lower) && !q.content.toLowerCase().includes(lower)) return false;
      return true;
    });
  }, [questions, row, level, usedByOthers, strict, term]);

  const topicTitle = row.topicId ? nodeMap.get(row.topicId)?.title : null;

  return (
    <Modal
      title={
        <>
          <span>Chọn câu hỏi – {row.type} #{rowNumber}</span>
        </>
      }
      widthClass="max-w-3xl"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          <label className={`flex items-center gap-1.5 ${hasConstraint ? "" : "opacity-50"}`}>
            <input type="checkbox" checked={strict} disabled={!hasConstraint} onChange={(e) => setStrict(e.target.checked)} />
            Chỉ hiện câu đúng dạng bài / mức độ đã chọn
            {topicTitle ? <em className="not-italic text-gray-400">· {topicTitle}</em> : null}
            {level ? <em className="not-italic text-gray-400">· Mức {level}</em> : null}
          </label>
          <span>
            {list.length > LIMIT ? `Hiển thị ${LIMIT} / ${list.length} câu` : `${list.length} câu phù hợp`}
          </span>
        </div>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Tìm theo mã hoặc nội dung..."
          className="h-9 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm focus:border-[#4A0E17] focus:outline-hidden focus:ring-1 focus:ring-[#4A0E17]"
        />
      </div>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          Không có câu nào phù hợp. Thử bỏ tick &quot;Chỉ hiện câu đúng dạng bài / mức độ&quot; hoặc đổi dạng bài.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, LIMIT).map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onPick(q)}
                className={`w-full rounded-md border p-3 text-left transition hover:border-[#4A0E17] hover:bg-[#4A0E17]/5 ${
                  row.questionId === q.id ? "border-[#4A0E17] bg-[#4A0E17]/5" : "border-gray-200"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold tracking-wide text-slate-700">{q.code}</span>
                  <span className="rounded bg-[#EAB308] px-1.5 py-0.5 font-bold text-slate-900">
                    {q.level ? `MỨC ${q.level}` : "CHƯA GÁN MỨC"}
                  </span>
                </div>
                <LatexRenderer content={q.content} className="line-clamp-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};