"use client";

import React, { useState, useRef } from "react";
import {
  Search,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ListChecks,
  SlidersHorizontal,
  ChevronDown,
  LayoutGrid,
  List,
  FileDown,
  Check,
  FileText,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { ViewMode, SortOption, DifficultyLevel, QuestionType } from "./types";

interface TopToolbarProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectAll: () => void;
  isAllSelected: boolean;
  selectedCount: number;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  selectedLevels: DifficultyLevel[];
  onToggleLevel: (level: DifficultyLevel) => void;
  selectedTypes: QuestionType[];
  onToggleType: (type: QuestionType) => void;
  onResetFilters: () => void;
  onExport: (format: "latex" | "docx" | "pdf" | "excel") => void;
  onBulkDelete: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  searchTerm,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  viewMode,
  onViewModeChange,
  onSelectAll,
  isAllSelected,
  selectedCount,
  sort,
  onSortChange,
  selectedLevels,
  onToggleLevel,
  selectedTypes,
  onToggleType,
  onResetFilters,
  onExport,
  onBulkDelete,
}) => {
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      alert(`Đã nhận ảnh "${file.name}" để tìm kiếm câu hỏi bằng hình ảnh/OCR.`);
    }
  };

  return (
    <div className="w-full flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-gray-200">
      {/* Left: Search input + Pagination Pill */}
      <div className="flex items-center gap-2.5 flex-1 max-w-full md:max-w-md lg:max-w-lg">
        {/* Search input bar with search icon and image attachment button */}
        <div className="relative flex-1 flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm"
            className="w-full h-9 pl-9 pr-9 text-xs sm:text-sm bg-white border border-gray-300 rounded-md shadow-2xs focus:outline-hidden focus:border-[#4A0E17] focus:ring-1 focus:ring-[#4A0E17] text-gray-800 placeholder:text-gray-400 transition"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Tìm kiếm bằng ảnh / Tải ảnh đề thi"
            className="absolute right-2 p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Pagination Control: Dark burgundy pill box */}
        <div className="flex items-center h-9 px-2.5 bg-[#4A0E17] text-white rounded-md shadow-2xs text-xs font-medium select-none shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            title="Trang trước"
            className="p-1 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-1 text-xs tracking-wide">
            Trang <span className="underline underline-offset-2 font-bold">{page}</span> / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            title="Trang tiếp"
            className="p-1 text-white/80 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right Actions: Row of action buttons outlined with borders */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
        {/* NÚT XÓA NHIỀU CÂU HỎI (Chỉ hiện khi có câu được chọn) */}
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onBulkDelete}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-red-600 bg-red-50 border border-red-200 hover:border-red-300 hover:bg-red-100 rounded-md shadow-2xs transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">XÓA ĐÃ CHỌN</span>
          </button>
        )}

        {/* SẮP XẾP */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowFilterDropdown(false);
              setShowExportDropdown(false);
            }}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-700 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-md shadow-2xs transition"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">SẮP XẾP</span>
          </button>

          {showSortDropdown && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-30 text-xs">
              <button
                type="button"
                onClick={() => {
                  onSortChange({ field: "number", direction: "asc" });
                  setShowSortDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-100 ${
                  sort.field === "number" && sort.direction === "asc" ? "font-bold text-[#4A0E17]" : "text-gray-700"
                }`}
              >
                <span>Thứ tự câu (Tăng dần)</span>
                {sort.field === "number" && sort.direction === "asc" && <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSortChange({ field: "number", direction: "desc" });
                  setShowSortDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-100 ${
                  sort.field === "number" && sort.direction === "desc" ? "font-bold text-[#4A0E17]" : "text-gray-700"
                }`}
              >
                <span>Thứ tự câu (Giảm dần)</span>
                {sort.field === "number" && sort.direction === "desc" && <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSortChange({ field: "level", direction: "asc" });
                  setShowSortDropdown(false);
                }}
                className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-100 ${
                  sort.field === "level" ? "font-bold text-[#4A0E17]" : "text-gray-700"
                }`}
              >
                <span>Theo mức độ (1 → 4)</span>
                {sort.field === "level" && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* CHỌN TẤT CẢ (TỐI ĐA 22) */}
        <button
          type="button"
          onClick={onSelectAll}
          className={`h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider border rounded-md shadow-2xs transition ${
            isAllSelected
              ? "bg-[#4A0E17]/10 text-[#4A0E17] border-[#4A0E17]"
              : "bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          <ListChecks className="w-3.5 h-3.5 text-[#4A0E17]" />
          <span>
            CHỌN TẤT CẢ (TỐI ĐA 22)
            {selectedCount > 0 && <span className="ml-1 text-[#4A0E17]">({selectedCount})</span>}
          </span>
        </button>

        {/* BỘ LỌC */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowFilterDropdown(!showFilterDropdown);
              setShowSortDropdown(false);
              setShowExportDropdown(false);
            }}
            className={`h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider border rounded-md shadow-2xs transition ${
              selectedLevels.length > 0 || selectedTypes.length > 0
                ? "bg-[#4A0E17]/10 text-[#4A0E17] border-[#4A0E17]"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
            <span>BỘ LỌC</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-30 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                <span className="font-bold text-gray-800">Bộ lọc câu hỏi</span>
                {(selectedLevels.length > 0 || selectedTypes.length > 0) && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-[11px] text-red-600 hover:underline"
                  >
                    Đặt lại
                  </button>
                )}
              </div>

              {/* Mức độ */}
              <div className="mb-3">
                <span className="block font-semibold text-gray-700 mb-1.5">Mức độ:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {([1, 2, 3, 4] as DifficultyLevel[]).map((lvl) => {
                    const isChecked = selectedLevels.includes(lvl);
                    return (
                      <label
                        key={lvl}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition ${
                          isChecked ? "bg-amber-50 border-amber-400 text-amber-900 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleLevel(lvl)}
                          className="rounded text-[#4A0E17] focus:ring-[#4A0E17]"
                        />
                        <span>Mức {lvl}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Loại câu hỏi */}
              <div>
                <span className="block font-semibold text-gray-700 mb-1.5">Kiểu câu hỏi:</span>
                <div className="space-y-1">
                  {(["Trắc nghiệm", "Đúng sai", "Trả lời ngắn", "Tự luận"] as QuestionType[]).map((t) => {
                    const isChecked = selectedTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition ${
                          isChecked ? "bg-amber-50 border-amber-400 text-amber-900 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleType(t)}
                          className="rounded text-[#4A0E17] focus:ring-[#4A0E17]"
                        />
                        <span>{t}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* XUẤT FILE */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowExportDropdown(!showExportDropdown);
              setShowFilterDropdown(false);
              setShowSortDropdown(false);
            }}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-700 bg-white border border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-md shadow-2xs transition"
          >
            <Check className="w-3.5 h-3.5 text-green-600" />
            <span>XUẤT FILE</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {showExportDropdown && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-30 text-xs">
              <button
                type="button"
                onClick={() => {
                  onExport("latex");
                  setShowExportDropdown(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-100"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Xuất file LaTeX (.tex)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExport("pdf");
                  setShowExportDropdown(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-100"
              >
                <FileDown className="w-3.5 h-3.5 text-red-600" />
                <span>Xuất PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExport("docx");
                  setShowExportDropdown(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-100"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Xuất Word (.docx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExport("excel");
                  setShowExportDropdown(false);
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-gray-700 hover:bg-gray-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xuất Excel (.xlsx)</span>
              </button>
            </div>
          )}
        </div>

        {/* Toggle View Mode buttons (Grid vs List) */}
        <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            title="Dạng danh sách"
            className={`p-2 transition ${
              viewMode === "list" ? "bg-[#4A0E17] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            title="Dạng lưới 2 cột"
            className={`p-2 transition ${
              viewMode === "grid" ? "bg-[#4A0E17] text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};