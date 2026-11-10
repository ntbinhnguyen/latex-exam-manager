"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCheck, Copy, Repeat2, XCircle } from "lucide-react";
import { QuestionBody } from "./QuestionBody";
import type { DupMatch, QuestionItem } from "./types";
import { DUP_BADGE_CLASS, DUP_LABEL, diffTokens, hasBlocking } from "@/lib/duplicates";

interface Props {
  current: QuestionItem;
  matches: DupMatch[];
  /** Tìm nội dung câu khác (trong ngân hàng hoặc đang chờ duyệt) theo id */
  resolve: (id: string) => QuestionItem | undefined;
  busy?: boolean;
  /** "Giữ cả hai": xác nhận không trùng */
  onDismiss?: () => void;
  /** Thay thế câu cũ trong ngân hàng bằng câu mới */
  onReplace?: (oldId: string) => void;
  /** Từ chối câu mới (vào Thùng rác) */
  onReject?: () => void;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const raw = (q: QuestionItem) => q.raw ?? `\\begin{ex}\n${q.content}\n\\end{ex}`;

/** Cảnh báo trùng + so sánh câu đang xét với từng câu nghi trùng (hiển thị cạnh nhau, tô điểm khác nhau). */
export const DuplicateComparePanel: React.FC<Props> = ({ current, matches, resolve, busy, onDismiss, onReplace, onReject }) => {
  const [openId, setOpenId] = useState<string>(matches[0]?.other_id ?? "");
  const active = matches.find((m) => m.other_id === openId) ?? matches[0];
  const other = active ? resolve(active.other_id) : undefined;
  const blocking = hasBlocking(matches);

  const diff = useMemo(() => (other ? diffTokens(raw(current), raw(other)) : null), [current, other]);

  const tone = blocking ? "border-red-200 bg-red-50/60" : "border-sky-200 bg-sky-50/60";

  return (
    <section className={`mb-4 rounded-lg border ${tone} p-3 text-xs`}>
      <div className="flex items-start gap-2 text-gray-800">
        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${blocking ? "text-red-600" : "text-sky-600"}`} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {blocking ? "Câu này nghi trùng với câu khác" : "Câu này giống câu khác nhưng khác số liệu"} ({matches.length})
          </div>
          <p className="mt-0.5 leading-relaxed text-gray-600">
            {blocking
              ? "Duyệt hàng loạt sẽ bỏ qua câu này. Hãy so sánh bên dưới rồi chọn: giữ cả hai, thay câu cũ hoặc từ chối câu mới."
              : "Hai câu cùng dạng nhưng khác số liệu hoặc đáp án nên không bị coi là trùng; vẫn duyệt bình thường."}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {matches.map((m) => (
          <button
            key={m.other_id}
            type="button"
            onClick={() => setOpenId(m.other_id)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 transition ${
              m.other_id === active?.other_id ? "border-gray-700 bg-white shadow-xs" : "border-gray-200 bg-white/70 hover:bg-white"
            }`}
          >
            <span className={`rounded px-1 py-px text-[10px] font-bold ${DUP_BADGE_CLASS[m.kind]}`}>{pct(m.similarity)}</span>
            <span className="font-medium text-gray-800">{m.other_code || "Chưa có ID"}</span>
            <span className="text-gray-500">{m.other_status === "pending" ? "· cũng đang chờ duyệt" : "· trong ngân hàng"}</span>
            {m.cross_id && <span className="text-gray-400">· khác ID</span>}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${DUP_BADGE_CLASS[active.kind]}`}>{DUP_LABEL[active.kind]}</span>
            <span className="text-gray-500">
              Độ giống {pct(active.similarity)}
              {active.cross_id ? " · khác ID (chỉ báo khi giống ≥ 90%)" : " · cùng ID"}
            </span>
          </div>

          {other ? (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4A0E17]">Câu mới (chờ duyệt)</div>
                  <QuestionBody question={current} showSolution={false} />
                </div>
                <div className="rounded border border-gray-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-600">
                    {active.other_status === "pending" ? "Câu khác trong đợt chờ duyệt" : "Câu đã có trong ngân hàng"}
                    {active.other_code ? ` · ${active.other_code}` : ""}
                  </div>
                  <QuestionBody question={other} showSolution={false} />
                </div>
              </div>

              {diff && (
                <details className="rounded border border-gray-200 bg-white p-2.5">
                  <summary className="cursor-pointer select-none font-semibold text-gray-700">Điểm khác nhau (mã LaTeX, tô vàng)</summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {[diff.left, diff.right].map((segs, i) => (
                      <pre
                        key={i}
                        className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-800"
                      >
                        {segs.map((s, k) =>
                          s.changed ? (
                            <mark key={k} className="rounded bg-yellow-200 px-0.5">
                              {s.text}{" "}
                            </mark>
                          ) : (
                            <span key={k}>{s.text} </span>
                          ),
                        )}
                      </pre>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <p className="rounded border border-dashed border-gray-300 bg-white p-3 text-gray-500">
              Không tải được nội dung câu kia (có thể đã bị xóa). Bấm “Giữ cả hai” hoặc tải lại trang để cập nhật.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={busy}
                className="flex h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" /> Giữ cả hai (không trùng)
              </button>
            )}
            {onReplace && active.other_status !== "pending" && (
              <button
                type="button"
                onClick={() => onReplace(active.other_id)}
                disabled={busy}
                className="flex h-8 items-center gap-1 rounded border border-emerald-600 bg-white px-2.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
              >
                <Repeat2 className="h-3.5 w-3.5" /> Thay thế câu cũ bằng câu mới
              </button>
            )}
            {onReject && (
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="flex h-8 items-center gap-1 rounded border border-red-300 bg-white px-2.5 font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              >
                <XCircle className="h-3.5 w-3.5" /> Từ chối câu mới
              </button>
            )}
            <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-500">
              <CheckCheck className="h-3 w-3" /> Muốn duyệt luôn: bấm “DUYỆT VÀO NGÂN HÀNG” ở dưới
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
