"use client";

import React from "react";
import { Check } from "lucide-react";
import { QuestionItem } from "./types";
import { LatexRenderer } from "./LatexRenderer";
import { LevelChips } from "./LevelChips";
import { hasValidId } from "@/lib/tree";

interface QuestionCardProps {
  question: QuestionItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onAddQuestion?: (id: string) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  isSelected,
  onToggleSelect,
  onOpen,
  onAddQuestion,
}) => {
  const stop = (fn: () => void) => (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(question.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(question.id);
        }
      }}
      title="Nhấn để xem đầy đủ nội dung câu hỏi"
      className={`flex cursor-pointer flex-col overflow-hidden rounded-md border bg-white shadow-2xs transition-all duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#4A0E17]/50 ${
        isSelected ? "border-amber-500 ring-2 ring-amber-400/30" : "border-gray-300 hover:border-[#4A0E17]/50 hover:shadow-md"
      }`}
    >
      <div className="flex shrink-0 select-none items-center justify-between gap-2 bg-[#4A0E17] px-2.5 py-1.5 text-white sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-bold tracking-wide sm:text-sm">Câu {question.number}</span>
          <span className="shrink-0 whitespace-nowrap rounded bg-[#EAB308] px-1.5 py-0.5 text-[10px] font-bold text-slate-900 shadow-2xs sm:text-[11px]">
            {question.type}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Mức độ: chỉ để xem */}
          <LevelChips level={question.level} />

          <button
            type="button"
            onClick={stop(() => onAddQuestion?.(question.id))}
            title="Thêm câu hỏi này vào đề thi"
            className="flex items-center gap-0.5 rounded border border-amber-400/50 bg-[#4A0E17] px-1 py-0.5 text-[9.5px] font-semibold text-white/90 transition hover:bg-amber-400/20 sm:px-1.5 sm:text-[10px]"
          >
            THÊM
          </button>

          <button
            type="button"
            onClick={stop(() => onToggleSelect(question.id))}
            title={isSelected ? "Bỏ chọn" : "Chọn câu này"}
            className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 transition ${
              isSelected
                ? "border-[#EAB308] bg-[#EAB308] text-slate-950"
                : "border-amber-400 bg-transparent hover:border-amber-300"
            }`}
          >
            {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {hasValidId(question) ? (
          <div className="mb-2 text-[11px] font-bold tracking-wide text-slate-700 sm:text-xs">{question.code}</div>
        ) : (
          <div className="mb-2">
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">Chưa gắn ID</span>
          </div>
        )}
        <div className="min-h-[52px]">
          <LatexRenderer content={question.content} className="line-clamp-4" />
        </div>
      </div>
    </div>
  );
};
