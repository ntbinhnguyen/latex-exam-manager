import React from "react";
import type { DifficultyLevel } from "./types";
import { LEVEL_NAMES } from "./types";

/** Hiển thị mức độ (chỉ đọc). Không có sự kiện click – việc sửa mức độ thuộc tab 'Quản lý'. */
export const LevelChips: React.FC<{ level: DifficultyLevel | null; compact?: boolean }> = ({ level, compact }) => (
  <div
    className="flex items-center gap-1"
    role="img"
    aria-label={level ? `Mức ${level}: ${LEVEL_NAMES[level]}` : "Chưa gán mức độ"}
    title={level ? `Mức ${level} – ${LEVEL_NAMES[level]}` : "Chưa gán mức độ"}
  >
    {([1, 2, 3, 4] as DifficultyLevel[]).map((lvl) => {
      const active = level === lvl;
      return (
        <span
          key={lvl}
          className={`cursor-default select-none rounded border px-1 py-0.5 font-semibold ${
            compact ? "text-[9px]" : "text-[9.5px] sm:text-[10px] sm:px-1.5"
          } ${
            active
              ? "border-[#EAB308] bg-[#EAB308] font-bold text-slate-950"
              : "border-amber-400/40 bg-transparent text-white/60"
          }`}
        >
          MỨC {lvl}
        </span>
      );
    })}
  </div>
);
