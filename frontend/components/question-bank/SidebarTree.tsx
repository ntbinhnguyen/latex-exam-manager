"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Folder,
  Layers,
  ChevronDown,
  ChevronRight,
  Search,
  MoreVertical,
  FileUp,
  FileSpreadsheet,
  FileJson,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Zap,
  Hand,
} from "lucide-react";
import { TreeNode } from "./types";
import type { TreeMode } from "@/lib/use-question-bank";
import { downloadTreeTemplateXlsx, treeToFlatRows } from "@/lib/tree";
import { downloadBlob, downloadText } from "@/lib/download";

interface SidebarTreeProps {
  treeData: TreeNode[];
  selectedFolderId: string;
  onSelectFolder: (id: string, folderTitle: string) => void;
  /** Ẩn menu nạp/xuất file (dùng khi mở trong hộp chọn dạng bài) */
  readOnly?: boolean;
  treeSource?: string;
  treeWarnings?: string[];
  /** Chế độ nạp cây: "auto" = đọc public/muc-luc.json, "manual" = file người dùng tự nạp */
  treeMode?: TreeMode;
  hasManualTree?: boolean;
  /** Trả về false nếu chưa thể chuyển (chưa có file thủ công) */
  onTreeModeChange?: (mode: TreeMode) => boolean;
  onReloadTree?: () => Promise<{ count: number; source: string }>;
  onLoadFile?: (file: File) => Promise<unknown>;
  onResetTree?: () => void;
  onNotify?: (msg: string) => void;
  maxHeightClass?: string;
}

const filterNodes = (nodes: TreeNode[], term: string): TreeNode[] => {
  if (!term.trim()) return nodes;
  const lower = term.toLowerCase();
  return nodes
    .map((node) => {
      const matches = node.title.toLowerCase().includes(lower) || node.id.toLowerCase().includes(lower);
      const kids = node.children ? filterNodes(node.children, term) : [];
      if (matches || kids.length > 0) return { ...node, children: kids.length ? kids : node.children };
      return null;
    })
    .filter(Boolean) as TreeNode[];
};

export const SidebarTree: React.FC<SidebarTreeProps> = ({
  treeData,
  selectedFolderId,
  onSelectFolder,
  readOnly = false,
  treeSource,
  treeWarnings = [],
  treeMode = "auto",
  hasManualTree = false,
  onTreeModeChange,
  onReloadTree,
  onLoadFile,
  onResetTree,
  onNotify,
  maxHeightClass = "max-h-[calc(100vh-260px)]",
}) => {
  const [treeSearch, setTreeSearch] = useState("");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const searching = treeSearch.trim().length > 0;
  const visibleTree = useMemo(() => filterNodes(treeData, treeSearch), [treeData, treeSearch]);

  const toggleNode = (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMap((prev) => ({ ...prev, [id]: !current }));
  };

  const exportRows = () => treeToFlatRows(treeData[0]?.id === "all" ? (treeData[0].children ?? []) : treeData);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onLoadFile) return;
    try {
      await onLoadFile(file);
      onNotify?.(`Đã nạp cây mục lục từ "${file.name}".`);
    } catch (err) {
      onNotify?.(err instanceof Error ? `Lỗi nạp cây: ${err.message}` : "Lỗi nạp cây mục lục.");
    }
  };

  const switchMode = (mode: TreeMode) => {
    if (!onTreeModeChange || mode === treeMode) return;
    if (!onTreeModeChange(mode)) {
      // chưa có file thủ công → mở hộp chọn file
      onNotify?.("Chưa có cây thủ công – hãy chọn file .json / .xlsx.");
      fileRef.current?.click();
      return;
    }
    onNotify?.(mode === "auto" ? "Đã chuyển sang cây TỰ ĐỘNG (public/muc-luc.json)." : "Đã chuyển sang cây THỦ CÔNG.");
  };

  const reload = async () => {
    if (!onReloadTree) return;
    try {
      const r = await onReloadTree();
      onNotify?.(`Đã tải lại cây tự động từ ${r.source} (${r.count} mục).`);
    } catch (err) {
      onNotify?.(err instanceof Error ? `Lỗi tải cây: ${err.message}` : "Lỗi tải cây tự động.");
    }
  };

  const renderTreeNodes = (nodes: TreeNode[], depth: number = 0) => (
    <div className="relative">
      {nodes.map((node) => {
        const isSelected = node.id === selectedFolderId;
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isOpen = openMap[node.id] ?? (searching || depth < 2);

        return (
          <div key={node.id} className="relative select-none">
            <div
              onClick={() => onSelectFolder(node.id, node.title)}
              className={`group my-0.5 flex cursor-pointer items-center justify-between rounded px-2 py-1 text-[12.5px] leading-snug transition ${
                isSelected
                  ? "border border-[#F59E0B]/40 bg-[#FDE68A] font-semibold text-slate-900 shadow-2xs"
                  : "text-slate-700 hover:bg-slate-100/80"
              }`}
              style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
            >
              <div className="flex min-w-0 items-center gap-1.5 pr-2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => toggleNode(node.id, isOpen, e)}
                    aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
                    className="shrink-0 rounded p-0.5 text-slate-400 transition hover:text-slate-700"
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}

                {node.icon === "stack" ? (
                  <Layers className="h-4 w-4 shrink-0 text-[#8B4553]" />
                ) : node.kind === "unassigned" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 fill-[#FDE68A]/70 text-[#E5A93C]" />
                )}

                <span
                  className={`truncate ${isSelected ? "font-semibold text-slate-900" : node.auto ? "font-normal italic text-slate-500" : "font-normal"}`}
                  title={`${node.title}\n(${node.id})${node.auto ? "\nMục tự sinh – chưa có tên trong file mục lục" : ""}`}
                >
                  {node.title}
                </span>
              </div>

              <span
                className={`shrink-0 pl-1.5 text-[11px] tabular-nums ${
                  isSelected ? "font-bold text-[#854D0E]" : "font-normal text-slate-400"
                }`}
              >
                {node.count.toLocaleString("vi-VN")}
              </span>
            </div>

            {hasChildren && isOpen && (
              <div className="relative">
                <div
                  className="pointer-events-none absolute border-l border-slate-300"
                  style={{ left: `${depth * 14 + 18}px`, top: "0px", bottom: "8px" }}
                />
                {renderTreeNodes(node.children!, depth + 1)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xs">
      <div className="relative flex shrink-0 items-center justify-center bg-[#4A0E17] px-3 py-2 text-sm font-semibold tracking-wide text-white">
        Cây mục lục
        {!readOnly && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Nạp / xuất cây mục lục"
              aria-label="Menu cây mục lục"
              className="rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-gray-200 bg-white py-1 text-xs font-normal text-gray-700 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                    onClick={() => {
                      setMenuOpen(false);
                      reload();
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Tải lại cây tự động (public/muc-luc.json)
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                    onClick={() => {
                      setMenuOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <FileUp className="h-3.5 w-3.5" /> Nạp cây từ file (.json / .xlsx)
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                    onClick={async () => {
                      setMenuOpen(false);
                      downloadBlob(await downloadTreeTemplateXlsx(exportRows()), "muc-luc.xlsx");
                    }}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Tải cây hiện tại / file mẫu .xlsx
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                    onClick={() => {
                      setMenuOpen(false);
                      downloadText(JSON.stringify(exportRows(), null, 2), "muc-luc.json", "application/json");
                    }}
                  >
                    <FileJson className="h-3.5 w-3.5" /> Tải cây hiện tại / file mẫu .json
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100"
                    onClick={() => {
                      setMenuOpen(false);
                      onResetTree?.();
                      onNotify?.("Đã bỏ file thủ công, dùng cây tự động.");
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Bỏ file thủ công, dùng cây tự động
                  </button>
                </div>
              </>
            )}
            <input ref={fileRef} type="file" accept=".json,.xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-b border-gray-100 bg-gray-50/50 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder="Tìm thư mục theo tên hoặc mã..."
            className="h-8 w-full rounded border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 transition placeholder:text-gray-400 focus:border-[#4A0E17] focus:outline-hidden"
          />
        </div>
        {!readOnly && (
          <div className="space-y-1">
            <div className="flex overflow-hidden rounded border border-gray-200 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => switchMode("auto")}
                title="Tự động đọc file public/muc-luc.json mỗi lần mở trang"
                className={`flex flex-1 items-center justify-center gap-1 px-2 py-1 transition ${
                  treeMode === "auto" ? "bg-[#4A0E17] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Zap className="h-3 w-3" /> Tự động
              </button>
              <button
                type="button"
                onClick={() => switchMode("manual")}
                title={hasManualTree ? "Dùng file mục lục bạn đã nạp" : "Nạp file mục lục (.json / .xlsx)"}
                className={`flex flex-1 items-center justify-center gap-1 border-l border-gray-200 px-2 py-1 transition ${
                  treeMode === "manual" ? "bg-[#4A0E17] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Hand className="h-3 w-3" /> Thủ công
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10.5px] text-gray-500">
              <span className="truncate" title={treeSource}>
                Nguồn: <strong className="font-semibold text-gray-700">{treeSource}</strong>
              </span>
              {treeWarnings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowWarn((v) => !v)}
                  className="flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800"
                >
                  <AlertTriangle className="h-3 w-3" /> {treeWarnings.length} cảnh báo
                </button>
              )}
            </div>
          </div>
        )}
        {showWarn && treeWarnings.length > 0 && (
          <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto rounded bg-amber-50 py-1.5 pl-5 pr-2 text-[10.5px] text-amber-900">
            {treeWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto p-2 ${maxHeightClass}`}>
        {renderTreeNodes(visibleTree)}
        {visibleTree.length === 0 && (
          <p className="py-6 text-center text-xs text-gray-400">Không tìm thấy thư mục phù hợp</p>
        )}
      </div>
    </div>
  );
};
