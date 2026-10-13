"use client";

import React from "react";
import { BarChart3 } from "lucide-react";

interface Props {
  total: number;
  /** số câu mức 1–2 */
  low: number;
  /** số câu mức 3–4 */
  high: number;
  /** tổng mức độ của các câu đã có mức (để tính độ khó) */
  levelSum: number;
}

const TOL = 5; // sai số cho phép so với chuẩn 70/30 (điểm %)

const DIFF_LABELS = ["Dễ", "Trung bình", "Khá", "Khó"];

export const MatrixStats: React.FC<Props> = ({ total, low, high, levelSum }) => {
  const rated = low + high;
  const unrated = total - rated;
  const pct = (n: number) => (rated ? Math.round((n / rated) * 100) : 0);
  const lowPct = pct(low);
  const highPct = rated ? 100 - lowPct : 0;

  let verdict = "Chưa đủ mức độ để đánh giá đề 70/30";
  let verdictTone = "text-gray-500";
  if (total > 0 && unrated === 0) {
    if (Math.abs(lowPct - 70) <= TOL) {
      verdict = `Đạt chuẩn 70/30 (${lowPct}% / ${highPct}%)`;
      verdictTone = "text-emerald-700";
    } else {
      verdict = `Lệch chuẩn 70/30 (${lowPct}% / ${highPct}%)`;
      verdictTone = "text-rose-700";
    }
  }

  const avg = rated ? levelSum / rated : null;
  const pos = avg === null ? 0 : ((avg - 1) / 3) * 100;
  const diffLabel = avg === null ? null : avg < 1.75 ? DIFF_LABELS[0] : avg < 2.5 ? DIFF_LABELS[1] : avg < 3.25 ? DIFF_LABELS[2] : DIFF_LABELS[3];

  const R = 80;
  const C = 2 * Math.PI * R;
  const lowLen = rated ? (C * low) / rated : 0;
  const highLen = rated ? (C * high) / rated : 0;

  return (
    <div className="font-ui-mono flex h-full flex-col overflow-hidden rounded-lg border border-[#4A0E17] bg-white">
      <div className="flex items-center gap-2 bg-[#4A0E17] px-4 py-3 text-sm font-bold text-white">
        <BarChart3 className="h-4 w-4" /> Thống kê và đánh giá đề
      </div>

      <div className="flex-1 space-y-4 p-4">
        <div className="rounded-md border border-gray-200 bg-[#F6F3F2] px-3 py-2.5 text-center">
          <div className={`text-[13px] font-semibold ${verdictTone}`}>{verdict}</div>
          <div className="mt-1 text-[11px] leading-snug text-gray-500">
            Chuẩn Bộ GD: 70% nhận biết–thông hiểu (mức 1–2) · 30% vận dụng–vận dụng cao (mức ≥3)
          </div>
        </div>

        <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[230px]" role="img" aria-label="Biểu đồ tỉ lệ mức độ">
          <circle cx="100" cy="100" r={R} fill="none" stroke="#EAEAEA" strokeWidth="38" />
          {rated > 0 && (
            <g transform="rotate(-90 100 100)">
              {low > 0 && (
                <circle cx="100" cy="100" r={R} fill="none" stroke="#5B0A12" strokeWidth="38" strokeDasharray={`${lowLen} ${C}`} />
              )}
              {high > 0 && (
                <circle
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke="#C8C8C8"
                  strokeWidth="38"
                  strokeDasharray={`${highLen} ${C}`}
                  strokeDashoffset={-lowLen}
                />
              )}
            </g>
          )}
          <text x="100" y="104" textAnchor="middle" fontSize="30" fontWeight="700" fill="#1f2937">
            {total}
          </text>
          <text x="100" y="124" textAnchor="middle" fontSize="11" fill="#6b7280">
            CÂU
          </text>
        </svg>

        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-sm bg-[#5B0A12]" /> Nhận biết – thông hiểu
            </span>
            <span className="font-semibold text-gray-700">{rated ? `${low} câu · ${lowPct}%` : "–"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-sm bg-[#C8C8C8]" /> Vận dụng và nâng cao
            </span>
            <span className="font-semibold text-gray-700">{rated ? `${high} câu · ${highPct}%` : "–"}</span>
          </div>
          {unrated > 0 && (
            <p className="text-[11px] leading-snug text-gray-400">
              {unrated} câu chưa chọn mức độ (không tính vào thống kê)
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-gray-700">
            <span>Độ khó đề</span>
            <span className="text-gray-500">{diffLabel ? `${diffLabel}${unrated > 0 ? " (tạm tính)" : ""}` : "–"}</span>
          </div>
          <div className="relative h-2 rounded-full bg-gray-200">
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#4A0E17] bg-white shadow"
              style={{ left: `${pos}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-gray-500">
            {DIFF_LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
