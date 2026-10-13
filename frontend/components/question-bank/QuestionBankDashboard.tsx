"use client";

import React, { useMemo, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
import {
  TreeNode,
  StatsData,
  QuestionItem,
  ViewMode,
  SortOption,
  DifficultyLevel,
  QuestionType,
} from "./types";
import { TopToolbar } from "./TopToolbar";
import { SidebarTree } from "./SidebarTree";
import { StatsPanel } from "./StatsPanel";
import { QuestionGrid } from "./QuestionGrid";
import { QuestionDetailModal } from "./QuestionDetailModal";
import { belongsTo, findNode } from "@/lib/tree";
import type { TreeMode } from "@/lib/use-question-bank";

const MAX_SELECT = 22;
const PAGE_SIZE = 12;

function filterAndSortQuestions(
  questions: QuestionItem[],
  searchTerm: string,
  selectedLevels: DifficultyLevel[],
  selectedTypes: QuestionType[],
  sort: SortOption,
): QuestionItem[] {
  const lower = searchTerm.trim().toLowerCase();
  const filtered = questions.filter((q) => {
    if (lower) {
      const hit =
        q.code.toLowerCase().includes(lower) ||
        q.content.toLowerCase().includes(lower) ||
        `câu ${q.number}`.includes(lower);
      if (!hit) return false;
    }
    if (selectedLevels.length > 0 && (q.level === null || !selectedLevels.includes(q.level))) return false;
    if (selectedTypes.length > 0 && !selectedTypes.includes(q.type)) return false;
    return true;
  });

  const dir = sort.direction === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (sort.field === "number") return (a.number - b.number) * dir;
    if (sort.field === "level") return ((a.level ?? 0) - (b.level ?? 0)) * dir;
    return a.code.localeCompare(b.code) * dir;
  });
}

interface QuestionBankDashboardProps {
  questions: QuestionItem[];
  treeData: TreeNode[];
  treeSource?: string;
  treeWarnings?: string[];
  dataSource?: "mock" | "api";
  treeMode?: TreeMode;
  hasManualTree?: boolean;
  onTreeModeChange?: (mode: TreeMode) => boolean;
  onReloadTree?: () => Promise<{ count: number; source: string }>;
  onLoadTreeFile?: (file: File) => Promise<unknown>;
  onResetTree?: () => void;
  /** Sửa mã LaTeX của câu hỏi */
  onSaveContent?: (id: string, raw: string) => Promise<unknown>;
  /** Gắn / đổi ID câu hỏi (dạng T0.TN.C1.B3.01) */
  onSaveId?: (id: string, code: string) => Promise<unknown>;
  /** Xóa (mềm) câu hỏi */
  onDeleteQuestion?: (id: string) => Promise<unknown>;
  onExportAction?: (format: string, selectedIds: string[]) => void;
  className?: string;
}

export const QuestionBankDashboard: React.FC<QuestionBankDashboardProps> = ({
  questions,
  treeData,
  treeSource,
  treeWarnings,
  dataSource = "api",
  treeMode,
  hasManualTree,
  onTreeModeChange,
  onReloadTree,
  onLoadTreeFile,
  onResetTree,
  onSaveContent,
  onSaveId,
  onDeleteQuestion,
  onExportAction,
  className = "",
}) => {
  const [folderId, setFolderId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<DifficultyLevel[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>([]);
  const [sort, setSort] = useState<SortOption>({ field: "number", direction: "asc" });
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Mục đang chọn (nếu cây vừa được nạp lại và mục cũ không còn → về "Tất cả")
  const activeNode = findNode(treeData, folderId) ?? treeData[0];
  const activeFolderId = activeNode?.id ?? "all";

  // Câu hỏi trong mục đang chọn (gồm cả các mục con), đánh số lại từ 1
  const folderQuestions = useMemo(
    () =>
      questions
        .filter((q) => belongsTo(q, activeFolderId))
        .map((q, i) => ({ ...q, number: i + 1 })),
    [questions, activeFolderId],
  );

  const filtered = useMemo(
    () => filterAndSortQuestions(folderQuestions, searchTerm, selectedLevels, selectedTypes, sort),
    [folderQuestions, searchTerm, selectedLevels, selectedTypes, sort],
  );

  const stats = useMemo<StatsData>(() => {
    const diff: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const types = { "Trắc nghiệm": 0, "Đúng sai": 0, "Trả lời ngắn": 0, "Tự luận": 0 };
    folderQuestions.forEach((q) => {
      if (q.level) diff[q.level]++;
      if (q.type === "Đúng/Sai" || q.type === "Đúng sai") types["Đúng sai"]++;
      else types[q.type]++;
    });
    return {
      difficulties: ([1, 2, 3, 4] as DifficultyLevel[]).map((level) => ({ level, count: diff[level] })),
      questionTypes: (Object.keys(types) as (keyof typeof types)[]).map((type) => ({ type, count: types[type] })),
      total: folderQuestions.length,
    };
  }, [folderQuestions]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const displayed = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const openIndex = openId ? filtered.findIndex((q) => q.id === openId) : -1;
  const openQuestion = openIndex >= 0 ? filtered[openIndex] : openId ? (questions.find((q) => q.id === openId) ?? null) : null;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_SELECT) {
          showToast(`Đã đạt giới hạn tối đa ${MAX_SELECT} câu hỏi được chọn!`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      showToast("Đã bỏ chọn tất cả câu hỏi.");
    } else {
      const ids = filtered.slice(0, MAX_SELECT).map((q) => q.id);
      setSelectedIds(new Set(ids));
      showToast(`Đã chọn ${ids.length} câu hỏi (tối đa ${MAX_SELECT} câu).`);
    }
  };

  const handleAddQuestion = (id: string) => {
    const q = questions.find((item) => item.id === id);
    if (q) showToast(`Đã thêm (${q.code}) vào đề thi.`);
  };

  const handleSaveContent = async (id: string, raw: string) => {
    await onSaveContent?.(id, raw);
    showToast("Đã lưu nội dung câu hỏi.");
  };

  const handleSaveId = async (id: string, code: string) => {
    await onSaveId?.(id, code);
    showToast(`Đã gắn ID ${code}.`);
  };

  const handleDelete = async (id: string) => {
    const idx = filtered.findIndex((q) => q.id === id);
    const nextId = idx >= 0 ? (filtered[idx + 1]?.id ?? filtered[idx - 1]?.id ?? null) : null;
    await onDeleteQuestion?.(id);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setOpenId(nextId);
    showToast("Đã xóa câu hỏi khỏi ngân hàng.");
  };

  // Hàm xử lý xóa hàng loạt
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.size} câu hỏi đã chọn?`)) return;

    if (!onDeleteQuestion) {
      showToast("Chức năng xóa chưa được hỗ trợ.");
      return;
    }

    let successCount = 0;
    // Dùng Promise.all để xóa đồng loạt hoặc vòng lặp for để xóa lần lượt
    for (const id of Array.from(selectedIds)) {
      try {
        await onDeleteQuestion(id);
        successCount++;
      } catch (error) {
        console.error("Lỗi khi xóa câu hỏi:", error);
      }
    }

    setSelectedIds(new Set());
    setOpenId(null);
    showToast(`Đã xóa thành công ${successCount} câu hỏi.`);
  };

  const handleToggleLevel = (lvl: DifficultyLevel) => {
    setSelectedLevels((prev) => (prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl]));
    setPage(1);
  };

  const handleToggleType = (type: QuestionType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedLevels([]);
    setSelectedTypes([]);
    setSearchTerm("");
    setPage(1);
  };

  const handleExport = (format: "latex" | "docx" | "pdf" | "excel") => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : filtered.map((q) => q.id);
    if (format !== "latex" && format !== "excel") {
      showToast("Định dạng này sẽ được bổ sung – hiện hỗ trợ LaTeX (.tex) và Excel.");
      return;
    }
    onExportAction?.(format, ids);
  };

  return (
    <div className={`flex w-full flex-col bg-[#F8F9FA] font-sans text-slate-800 ${className}`}>
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-lg bg-[#4A0E17] px-4 py-2.5 text-xs text-white shadow-xl sm:text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="w-full bg-[#F8F9FA] pb-2 pt-2">
        <TopToolbar
          searchTerm={searchTerm}
          onSearchChange={(v) => {
            setSearchTerm(v);
            setPage(1);
          }}
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSelectAll={handleSelectAll}
          isAllSelected={selectedIds.size > 0 && selectedIds.size === Math.min(MAX_SELECT, filtered.length)}
          selectedCount={selectedIds.size}
          sort={sort}
          onSortChange={setSort}
          selectedLevels={selectedLevels}
          onToggleLevel={handleToggleLevel}
          selectedTypes={selectedTypes}
          onToggleType={handleToggleType}
          onResetFilters={handleResetFilters}
          onExport={handleExport}
          onBulkDelete={handleBulkDelete}
        />
      </div>

      {dataSource === "mock" && (
        <div className="mb-1 flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Đang hiển thị dữ liệu mẫu vì chưa kết nối được backend hoặc ngân hàng còn trống.
        </div>
      )}

      <div className="flex w-full flex-col items-stretch gap-3.5 pb-6 pt-2 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[28%] xl:w-[26%]">
          <SidebarTree
            treeData={treeData}
            selectedFolderId={activeFolderId}
            onSelectFolder={(id) => {
              setFolderId(id);
              setPage(1);
            }}
            treeSource={treeSource}
            treeWarnings={treeWarnings}
            treeMode={treeMode}
            hasManualTree={hasManualTree}
            onTreeModeChange={onTreeModeChange}
            onReloadTree={onReloadTree}
            onLoadFile={onLoadTreeFile}
            onResetTree={onResetTree}
            onNotify={showToast}
          />
        </aside>

        <main className="flex min-w-0 w-full flex-1 flex-col gap-3 lg:w-[72%] xl:w-[74%]">
          <StatsPanel stats={stats} />

          <div className="flex items-center justify-between px-1 text-xs text-gray-500">
            <span className="truncate font-medium text-slate-700">
              Đang xem: <strong className="text-[#4A0E17]">{activeNode?.title ?? "Tất cả"}</strong> ({filtered.length} câu)
            </span>
            {selectedIds.size > 0 && (
              <span className="rounded bg-amber-100/70 px-2 py-0.5 font-semibold text-amber-700">
                Đã chọn {selectedIds.size} / {MAX_SELECT} câu
              </span>
            )}
          </div>

          <div className="flex-1">
            <QuestionGrid
              questions={displayed}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onOpenQuestion={setOpenId}
              onAddQuestion={handleAddQuestion}
              viewMode={viewMode}
            />
          </div>
        </main>
      </div>

      {openQuestion && (
        <QuestionDetailModal
          key={openQuestion.id}
          question={openQuestion}
          treeData={treeData}
          suggestId={findNode(treeData, activeFolderId)?.kind ? activeFolderId : undefined}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].id) : undefined}
          position={openIndex >= 0 ? `${openIndex + 1} / ${filtered.length}` : undefined}
          onSaveContent={onSaveContent ? handleSaveContent : undefined}
          onSaveId={onSaveId ? handleSaveId : undefined}
          onDelete={onDeleteQuestion ? handleDelete : undefined}
          isSelected={selectedIds.has(openQuestion.id)}
          onToggleSelect={handleToggleSelect}
          onAddQuestion={handleAddQuestion}
        />
      )}
    </div>
  );
};