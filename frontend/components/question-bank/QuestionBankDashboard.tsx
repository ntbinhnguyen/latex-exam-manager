"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, CheckCircle2, ClipboardCheck, Info, XCircle } from "lucide-react";
import {
  TreeNode,
  StatsData,
  QuestionItem,
  ViewMode,
  SortOption,
  DifficultyLevel,
  QuestionType,
  DupMap,
} from "./types";
import { TopToolbar } from "./TopToolbar";
import { SidebarTree } from "./SidebarTree";
import { StatsPanel } from "./StatsPanel";
import { QuestionGrid } from "./QuestionGrid";
import { QuestionDetailModal } from "./QuestionDetailModal";
import { PENDING_ID, belongsTo, findNode, hasValidId } from "@/lib/tree";
import { DUP_LABEL, hasBlocking, isBlockingKind, worstMatch } from "@/lib/duplicates";
import type { TreeMode } from "@/lib/use-question-bank";

const NO_PENDING: QuestionItem[] = [];
const NO_DUPES: DupMap = {};
const MAX_SELECT = 22;
const PAGE_SIZE = 12;

/**
 * Chuẩn hóa nhãn loại câu hỏi để so khớp: dữ liệu thật dùng "Đúng/Sai" (từ ID "DS"),
 * còn ô lọc dùng "Đúng sai" -> coi hai nhãn là một.
 */
const typeKey = (t: QuestionType): string => (t === "Đúng/Sai" ? "Đúng sai" : t);

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
    if (selectedTypes.length > 0 && !selectedTypes.some((t) => typeKey(t) === typeKey(q.type))) return false;
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
  /** Lý do không tải được dữ liệu thật từ backend (nếu có) */
  dataError?: string | null;
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
  /** Câu hỏi mới nhập, đang chờ kiểm duyệt (hiện ở mục "Câu hỏi chờ kiểm duyệt") */
  pendingQuestions?: QuestionItem[];
  /** Duyệt các câu (theo id) để đưa vào ngân hàng. force = true: vẫn duyệt dù nghi trùng. Trả về các câu bị bỏ qua vì nghi trùng. */
  onApprovePending?: (ids: string[], force?: boolean) => Promise<{ approved: number; skipped: { id: string }[] }>;
  /** Kết quả kiểm tra trùng nội dung của các câu chờ duyệt: { id câu: [các câu nghi trùng] } */
  duplicates?: DupMap;
  /** "Giữ cả hai (không trùng)" */
  onDismissDuplicates?: (id: string) => Promise<unknown>;
  /** Thay thế câu cũ trong ngân hàng bằng câu chờ duyệt */
  onReplaceWithPending?: (id: string, oldId: string) => Promise<unknown>;
  /** Từ chối các câu chờ duyệt (chuyển vào Thùng rác) */
  onRejectPending?: (ids: string[]) => Promise<unknown>;
  /** Yêu cầu chuyển tới một mục trên cây (đổi `nonce` để chuyển lại), vd. mở mục chờ kiểm duyệt sau khi nhập đề */
  jumpTo?: { id: string; nonce: number } | null;
  onExportAction?: (format: string, selectedIds: string[]) => void;
  className?: string;
}

export const QuestionBankDashboard: React.FC<QuestionBankDashboardProps> = ({
  questions,
  treeData,
  treeSource,
  treeWarnings,
  dataSource = "api",
  dataError = null,
  treeMode,
  hasManualTree,
  onTreeModeChange,
  onReloadTree,
  onLoadTreeFile,
  onResetTree,
  onSaveContent,
  onSaveId,
  onDeleteQuestion,
  pendingQuestions = NO_PENDING,
  onApprovePending,
  onRejectPending,
  duplicates = NO_DUPES,
  onDismissDuplicates,
  onReplaceWithPending,
  jumpTo,
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
  const isPendingView = activeFolderId === PENDING_ID;
  const pendingIdSet = useMemo(() => new Set(pendingQuestions.map((q) => q.id)), [pendingQuestions]);

  // Được yêu cầu chuyển mục từ bên ngoài (vd. vừa nhập đề xong -> mở mục chờ kiểm duyệt)
  useEffect(() => {
    if (!jumpTo) return;
    setFolderId(jumpTo.id);
    setPage(1);
    setSelectedIds(new Set());
  }, [jumpTo]);

  // Câu hỏi trong mục đang chọn (gồm cả các mục con), đánh số lại từ 1
  const folderQuestions = useMemo(
    () =>
      isPendingView
        ? pendingQuestions.map((q, i) => ({ ...q, number: i + 1 }))
        : questions.filter((q) => belongsTo(q, activeFolderId)).map((q, i) => ({ ...q, number: i + 1 })),
    [questions, pendingQuestions, activeFolderId, isPendingView],
  );

  const filteredBase = useMemo(
    () => filterAndSortQuestions(folderQuestions, searchTerm, selectedLevels, selectedTypes, sort),
    [folderQuestions, searchTerm, selectedLevels, selectedTypes, sort],
  );

  // Mục kiểm duyệt: có thể chỉ xem các câu nghi trùng / giống nhưng khác số liệu
  const [onlyDup, setOnlyDup] = useState(false);
  const filtered = useMemo(
    () =>
      isPendingView && onlyDup ? filteredBase.filter((q) => (duplicates[q.id]?.length ?? 0) > 0) : filteredBase,
    [filteredBase, isPendingView, onlyDup, duplicates],
  );
  const dupBlockingCount = pendingQuestions.filter((q) => hasBlocking(duplicates[q.id])).length;
  const dupLabelCount = pendingQuestions.filter((q) => (duplicates[q.id]?.length ?? 0) > 0 && !hasBlocking(duplicates[q.id])).length;
  useEffect(() => {
    if (onlyDup && dupBlockingCount + dupLabelCount === 0) setOnlyDup(false);
  }, [onlyDup, dupBlockingCount, dupLabelCount]);
  const allById = useMemo(() => new Map([...questions, ...pendingQuestions].map((q) => [q.id, q])), [questions, pendingQuestions]);

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
  const openQuestion = openIndex >= 0 ? filtered[openIndex] : openId ? ([...questions, ...pendingQuestions].find((q) => q.id === openId) ?? null) : null;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (!isPendingView && next.size >= MAX_SELECT) {
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
      // Mục kiểm duyệt không giới hạn 22 câu (giới hạn này chỉ dành cho việc chọn câu ra đề)
      const ids = filtered.slice(0, isPendingView ? filtered.length : MAX_SELECT).map((q) => q.id);
      setSelectedIds(new Set(ids));
      showToast(isPendingView ? `Đã chọn ${ids.length} câu hỏi.` : `Đã chọn ${ids.length} câu hỏi (tối đa ${MAX_SELECT} câu).`);
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
    showToast("Đã chuyển câu hỏi vào Thùng rác (có thể phục hồi).");
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
    let failCount = 0;
    let lastError = "";
    // Dùng Promise.all để xóa đồng loạt hoặc vòng lặp for để xóa lần lượt
    for (const id of Array.from(selectedIds)) {
      try {
        await onDeleteQuestion(id);
        successCount++;
      } catch (error) {
        failCount++;
        lastError = error instanceof Error ? error.message : String(error);
        console.error("Lỗi khi xóa câu hỏi:", error);
      }
    }

    setSelectedIds(new Set());
    setOpenId(null);
    showToast(
      failCount > 0
        ? `Đã xóa ${successCount} câu, ${failCount} câu thất bại: ${lastError}`
        : `Đã xóa thành công ${successCount} câu hỏi.`,
    );
  };

  // ---- Kiểm duyệt: duyệt từng câu / hàng loạt, hoặc từ chối ----
  const hasActiveFilter = Boolean(searchTerm.trim()) || selectedLevels.length > 0 || selectedTypes.length > 0 || onlyDup;
  const selectedPendingIds = Array.from(selectedIds).filter((id) => pendingIdSet.has(id));
  const noIdInList = filtered.filter((q) => !hasValidId(q)).length;

  const runApprove = async (ids: string[], force = false): Promise<number> => {
    if (!onApprovePending || ids.length === 0) return 0;
    let res: { approved: number; skipped: { id: string }[] };
    try {
      res = await onApprovePending(ids, force);
    } catch (e) {
      showToast(`Không duyệt được: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
    const skipped = new Set(res.skipped.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (!skipped.has(id)) next.delete(id);
      });
      return next;
    });
    if (res.skipped.length > 0) {
      // backend kiểm tra trùng lại lúc duyệt: câu nghi trùng không được duyệt, để người dùng xem lại
      if (ids.length > 1) setOnlyDup(true);
      showToast(`Đã duyệt ${res.approved} câu; bỏ qua ${res.skipped.length} câu nghi trùng – mở từng câu để xem và quyết định.`);
    } else {
      showToast(`Đã duyệt ${res.approved} câu vào ngân hàng.`);
    }
    return res.approved;
  };

  const nextIdAfter = (id: string): string | null => {
    const idx = filtered.findIndex((q) => q.id === id);
    return idx >= 0 ? (filtered[idx + 1]?.id ?? filtered[idx - 1]?.id ?? null) : null;
  };

  /** Duyệt 1 câu; nếu đang mở hộp chi tiết thì chuyển sang câu kế tiếp để duyệt liên tục. Câu nghi trùng: hỏi xác nhận trước. */
  const handleApproveOne = async (id: string) => {
    const nextId = nextIdAfter(id);
    const ms = duplicates[id];
    let force = false;
    if (hasBlocking(ms)) {
      const w = worstMatch(ms.filter((m) => isBlockingKind(m.kind)))!;
      const ok = window.confirm(
        `Câu này nghi trùng (${DUP_LABEL[w.kind].toLowerCase()}, giống ${Math.round(w.similarity * 100)}% với câu ${w.other_code ?? "chưa có ID"}).\n\nVẫn duyệt vào ngân hàng?`,
      );
      if (!ok) return;
      force = true;
    }
    const n = await runApprove([id], force);
    if (n > 0 && openId === id) setOpenId(nextId);
  };

  const handleApproveSelected = () => {
    void runApprove(selectedPendingIds); // câu nghi trùng sẽ được backend bỏ qua
  };

  const handleApproveAll = () => {
    if (filtered.length === 0) return;
    const blockedHere = filtered.filter((q) => hasBlocking(duplicates[q.id])).length;
    const okCount = filtered.length - blockedHere;
    if (okCount === 0) {
      showToast(`Cả ${filtered.length} câu đều nghi trùng – hãy mở từng câu để xem và quyết định.`);
      return;
    }
    const scope = hasActiveFilter ? "đang hiển thị theo bộ lọc / tìm kiếm" : "đang chờ kiểm duyệt";
    const skipNote = blockedHere > 0 ? `\n\n${blockedHere} câu nghi trùng sẽ được BỎ QUA để bạn xem lại.` : "";
    const warn = noIdInList > 0 ? `\n\nTrong đó ${noIdInList} câu chưa có ID hợp lệ (sẽ nằm ở mục "Chưa gắn ID / Lỗi ID").` : "";
    if (!window.confirm(`Duyệt ${okCount} câu ${scope} vào ngân hàng?${skipNote}${warn}`)) return;
    void runApprove(filtered.map((q) => q.id));
  };

  // ---- Xử lý câu nghi trùng (trong hộp chi tiết) ----
  const handleDismissDup = async (id: string) => {
    await onDismissDuplicates?.(id);
    showToast("Đã giữ cả hai câu – không cảnh báo trùng với các câu này nữa.");
  };

  const handleReplaceDup = async (id: string, oldId: string) => {
    if (!onReplaceWithPending) return;
    if (!window.confirm("Thay thế câu cũ trong ngân hàng bằng câu mới này?\n\nCâu cũ sẽ chuyển vào Thùng rác (có thể phục hồi).")) return;
    const nextId = nextIdAfter(id);
    await onReplaceWithPending(id, oldId);
    showToast("Đã thay thế câu cũ bằng câu mới.");
    if (openId === id) setOpenId(nextId);
  };

  const handleRejectOne = async (id: string) => {
    if (!onRejectPending) return;
    if (!window.confirm("Từ chối câu mới này?\n\nCâu sẽ chuyển vào Thùng rác (có thể phục hồi).")) return;
    const nextId = nextIdAfter(id);
    await onRejectPending([id]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("Đã chuyển câu vào Thùng rác.");
    if (openId === id) setOpenId(nextId);
  };

  const handleRejectSelected = async () => {
    if (!onRejectPending || selectedPendingIds.length === 0) return;
    if (!window.confirm(`Từ chối ${selectedPendingIds.length} câu đã chọn?\n\nCác câu này sẽ được chuyển vào Thùng rác (có thể phục hồi).`)) return;
    try {
      await onRejectPending(selectedPendingIds);
    } catch (e) {
      showToast(`Không từ chối được: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectedPendingIds.forEach((id) => next.delete(id));
      return next;
    });
    setOpenId(null);
    showToast(`Đã chuyển ${selectedPendingIds.length} câu vào Thùng rác.`);
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
          isAllSelected={
            selectedIds.size > 0 && selectedIds.size === (isPendingView ? filtered.length : Math.min(MAX_SELECT, filtered.length))
          }
          selectedCount={selectedIds.size}
          sort={sort}
          onSortChange={setSort}
          selectedLevels={selectedLevels}
          onToggleLevel={handleToggleLevel}
          selectedTypes={selectedTypes}
          onToggleType={handleToggleType}
          onResetFilters={handleResetFilters}
          onExport={handleExport}
          onBulkDelete={isPendingView ? handleRejectSelected : handleBulkDelete}
        />
      </div>

      {dataSource === "mock" && (
        <div className="mb-1 flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Đang hiển thị dữ liệu mẫu — chưa kết nối được backend{dataError ? `: ${dataError}` : "."} Các thao tác xóa/sửa sẽ không được lưu.
        </div>
      )}

      <div className="flex w-full flex-col items-stretch gap-3.5 pb-6 pt-2 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[28%] xl:w-[26%]">
          <SidebarTree
            treeData={treeData}
            selectedFolderId={activeFolderId}
            onSelectFolder={(id) => {
              // đổi qua/lại giữa mục kiểm duyệt và ngân hàng: bỏ chọn để không lẫn lộn câu chờ duyệt với câu trong ngân hàng
              if ((id === PENDING_ID) !== isPendingView) setSelectedIds(new Set());
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

          {isPendingView && (
            <div className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-950">
              <div className="flex items-start gap-2">
                <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <p className="leading-relaxed">
                  <strong>Câu hỏi chờ kiểm duyệt:</strong> các câu mới nhập từ file LaTeX chưa thuộc ngân hàng. Mở từng câu để xem, sửa nội dung /
                  gắn ID rồi bấm <b>DUYỆT</b>; hoặc tích chọn nhiều câu để duyệt hàng loạt (câu nghi trùng sẽ được bỏ qua để bạn xem lại).
                  {noIdInList > 0 && <> {noIdInList} câu chưa có ID hợp lệ vẫn duyệt được và sẽ nằm ở mục “Chưa gắn ID / Lỗi ID”.</>}
                </p>
              </div>
              {dupBlockingCount + dupLabelCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    {dupBlockingCount > 0 && <b>{dupBlockingCount} câu nghi trùng</b>}
                    {dupBlockingCount > 0 && dupLabelCount > 0 && ", "}
                    {dupLabelCount > 0 && <>{dupLabelCount} câu giống nhưng khác số liệu</>}
                    {" "}(so với ngân hàng và với nhau).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyDup((v) => !v);
                      setPage(1);
                    }}
                    className="ml-auto rounded border border-amber-400 bg-white px-2 py-0.5 font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    {onlyDup ? "Hiện tất cả câu" : "Chỉ xem câu nghi trùng"}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleApproveSelected}
                  disabled={selectedPendingIds.length === 0}
                  className="flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Duyệt đã chọn ({selectedPendingIds.length})
                </button>
                <button
                  type="button"
                  onClick={handleApproveAll}
                  disabled={filtered.length === 0}
                  className="flex h-8 items-center gap-1 rounded border border-emerald-600 bg-white px-3 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Duyệt tất cả ({filtered.length})
                </button>
                <button
                  type="button"
                  onClick={handleRejectSelected}
                  disabled={selectedPendingIds.length === 0 || !onRejectPending}
                  className="flex h-8 items-center gap-1 rounded border border-red-300 bg-white px-3 font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <XCircle className="h-3.5 w-3.5" /> Từ chối đã chọn ({selectedPendingIds.length})
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-1 text-xs text-gray-500">
            <span className="truncate font-medium text-slate-700">
              Đang xem: <strong className="text-[#4A0E17]">{activeNode?.title ?? "Tất cả"}</strong> ({filtered.length} câu)
            </span>
            {selectedIds.size > 0 && (
              <span className="rounded bg-amber-100/70 px-2 py-0.5 font-semibold text-amber-700">
                {isPendingView ? `Đã chọn ${selectedIds.size} câu` : `Đã chọn ${selectedIds.size} / ${MAX_SELECT} câu`}
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
              reviewMode={isPendingView}
              onApprove={handleApproveOne}
              duplicates={isPendingView ? duplicates : undefined}
              emptyMessage={
                isPendingView && pendingQuestions.length === 0
                  ? {
                      title: "Không có câu hỏi nào đang chờ kiểm duyệt.",
                      hint: "Câu hỏi mới nhập từ file LaTeX (nút “Nhập đề LaTeX”) sẽ xuất hiện ở đây để bạn duyệt trước khi đưa vào ngân hàng.",
                    }
                  : undefined
              }
            />
          </div>
        </main>
      </div>

      {openQuestion && (
        <QuestionDetailModal
          key={openQuestion.id}
          question={openQuestion}
          treeData={treeData}
          suggestId={!isPendingView && findNode(treeData, activeFolderId)?.kind ? activeFolderId : undefined}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : undefined}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].id) : undefined}
          position={openIndex >= 0 ? `${openIndex + 1} / ${filtered.length}` : undefined}
          onSaveContent={onSaveContent ? handleSaveContent : undefined}
          onSaveId={onSaveId ? handleSaveId : undefined}
          onDelete={onDeleteQuestion ? handleDelete : undefined}
          isSelected={selectedIds.has(openQuestion.id)}
          onToggleSelect={handleToggleSelect}
          onAddQuestion={isPendingView ? undefined : handleAddQuestion}
          onApprove={isPendingView && onApprovePending ? handleApproveOne : undefined}
          duplicates={isPendingView ? duplicates[openQuestion.id] : undefined}
          resolveQuestion={isPendingView ? (rid: string) => allById.get(rid) : undefined}
          onDismissDup={isPendingView && onDismissDuplicates ? handleDismissDup : undefined}
          onReplaceDup={isPendingView && onReplaceWithPending ? handleReplaceDup : undefined}
          onRejectNew={isPendingView && onRejectPending ? handleRejectOne : undefined}
        />
      )}
    </div>
  );
};