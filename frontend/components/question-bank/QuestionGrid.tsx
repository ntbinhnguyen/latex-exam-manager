"use client";

import React from "react";
import { DupMap, QuestionItem, ViewMode } from "./types";
import { worstMatch } from "@/lib/duplicates";
import { QuestionCard } from "./QuestionCard";

interface QuestionGridProps {
  questions: QuestionItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onAddQuestion?: (id: string) => void;
  viewMode: ViewMode;
  reviewMode?: boolean;
  onApprove?: (id: string) => void;
  /** Kết quả kiểm tra trùng theo id câu (mục chờ kiểm duyệt) */
  duplicates?: DupMap;
  /** Nội dung hiển thị khi danh sách trống (mặc định: không có câu phù hợp bộ lọc) */
  emptyMessage?: { title: string; hint?: string };
}

export const QuestionGrid: React.FC<QuestionGridProps> = ({
  questions,
  selectedIds,
  onToggleSelect,
  onOpenQuestion,
  onAddQuestion,
  viewMode,
  reviewMode,
  onApprove,
  duplicates,
  emptyMessage,
}) => {
  if (questions.length === 0) {
    return (
      <div className="w-full rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-2xs">
        <p className="text-sm font-medium">{emptyMessage?.title ?? "Không tìm thấy câu hỏi phù hợp với bộ lọc hiện tại."}</p>
        <p className="mt-1 text-xs text-gray-400">
          {emptyMessage?.hint ?? "Hãy thử đổi từ khóa tìm kiếm hoặc chọn thư mục khác trên cây mục lục."}
        </p>
      </div>
    );
  }

  return (
    <div className={viewMode === "grid" ? "grid grid-cols-1 gap-3 xl:grid-cols-2" : "flex flex-col gap-3"}>
      {questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          isSelected={selectedIds.has(question.id)}
          onToggleSelect={onToggleSelect}
          onOpen={onOpenQuestion}
          onAddQuestion={onAddQuestion}
          reviewMode={reviewMode}
          onApprove={onApprove}
          duplicate={worstMatch(duplicates?.[question.id])}
        />
      ))}
    </div>
  );
};
