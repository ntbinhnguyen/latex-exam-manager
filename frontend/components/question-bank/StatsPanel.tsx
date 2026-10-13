"use client";

import React from "react";
import { StatsData } from "./types";

interface StatsPanelProps {
  stats: StatsData;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
  return (
    <div className="w-full bg-white border border-gray-200 rounded-lg p-2 sm:p-2.5 shadow-2xs overflow-x-auto flex items-center justify-between gap-2.5 sm:gap-4 select-none">
      {/* 1. Main Label: Dark burgundy box with text "Thống kê" */}
      <div className="h-14 px-3 sm:px-4 bg-[#4A0E17] text-white rounded-md flex items-center justify-center font-bold text-xs sm:text-sm tracking-wide shrink-0 shadow-2xs">
        Thống kê
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        {/* 2. Difficulty Breakdown: Mức / Số câu */}
        <div className="flex flex-col gap-1 text-[11px] sm:text-xs">
          {/* Header Row: Mức, 1, 2, 3, 4 */}
          <div className="flex items-center gap-1 text-center">
            <span className="w-12 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-700 font-medium bg-gray-50/60">
              Mức
            </span>
            {stats.difficulties.map((d) => (
              <span
                key={d.level}
                className="w-7 sm:w-8 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-800 font-semibold"
              >
                {d.level}
              </span>
            ))}
          </div>
          {/* Data Row: Số câu, [14], [18], [2], [2] */}
          <div className="flex items-center gap-1 text-center">
            <span className="w-12 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-700 font-medium bg-gray-50/60">
              Số câu
            </span>
            {stats.difficulties.map((d) => (
              <span
                key={d.level}
                className="w-7 sm:w-8 h-6 flex items-center justify-center bg-[#4A0E17] text-white font-bold rounded shadow-2xs"
              >
                {d.count}
              </span>
            ))}
          </div>
        </div>

        {/* 3. Question Type Breakdown: Kiểu / Số câu */}
        <div className="flex flex-col gap-1 text-[11px] sm:text-xs">
          {/* Header Row: Kiểu, Trắc nghiệm, Đúng sai, Trả lời ngắn, Tự luận */}
          <div className="flex items-center gap-1 text-center">
            <span className="w-12 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-700 font-medium bg-gray-50/60">
              Kiểu
            </span>
            {stats.questionTypes.map((t) => (
              <span
                key={t.type}
                className="px-2 sm:px-2.5 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-800 font-medium whitespace-nowrap"
              >
                {t.type}
              </span>
            ))}
          </div>
          {/* Data Row: Số câu, [34], [2], [0], [0] */}
          <div className="flex items-center gap-1 text-center">
            <span className="w-12 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-700 font-medium bg-gray-50/60">
              Số câu
            </span>
            {stats.questionTypes.map((t) => (
              <span
                key={t.type}
                className="flex-1 h-6 flex items-center justify-center bg-[#4A0E17] text-white font-bold rounded shadow-2xs min-w-8"
              >
                {t.count}
              </span>
            ))}
          </div>
        </div>

        {/* 4. Total Count: Tổng / [36] */}
        <div className="flex flex-col gap-1 text-[11px] sm:text-xs shrink-0">
          <span className="w-11 sm:w-12 h-6 flex items-center justify-center border border-gray-300 rounded text-slate-800 font-semibold bg-gray-50/60">
            Tổng
          </span>
          <span className="w-11 sm:w-12 h-6 flex items-center justify-center bg-[#4A0E17] text-white font-bold rounded shadow-2xs">
            {stats.total}
          </span>
        </div>
      </div>
    </div>
  );
};
