"use client";

import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { parseExercise, type ParsedEx } from "@/lib/exam-parser";
import { LatexRenderer } from "./LatexRenderer";
import { TikzFigure, splitTikz } from "./TikzRenderer";
import type { QuestionItem, QuestionType } from "./types";

function kindOf(t: QuestionType): ParsedEx["kind"] {
  if (t === "Đúng/Sai" || t === "Đúng sai") return "tf";
  if (t === "Trả lời ngắn") return "short";
  if (t === "Tự luận") return "essay";
  return "choice";
}

export function useParsed(q: QuestionItem): ParsedEx {
  return useMemo<ParsedEx>(() => {
    if (q.raw) {
      const p = parseExercise(q.raw);
      return { ...p, solution: p.solution ?? q.solution ?? null, answer: p.answer ?? q.answer ?? null };
    }
    return {
      kind: kindOf(q.type),
      stem: q.content,
      choices: [],
      answer: q.answer ?? null,
      solution: q.solution ?? null,
      hasFigure: false,
    };
  }, [q]);
}

/* ---------- Hình TikZ ----------
 * Trước khi đưa cho parser, mỗi khối tikzpicture (kèm \begin{center}…\end{center} bao quanh)
 * được thay bằng một marker chữ-số thuần (QQTIKZ0QQ…). Parser giữ nguyên marker trong đề,
 * phương án và lời giải; khi hiển thị ta tách theo marker và chèn <TikzFigure /> đúng chỗ.
 */
const MARKER_SPLIT = /(QQTIKZ\d+QQ)/;
const MARKER_ONE = /^QQTIKZ(\d+)QQ$/;

function useTikzStripped(q: QuestionItem): { stripped: QuestionItem; figs: string[] } {
  return useMemo(() => {
    const figs: string[] = [];
    const strip = (s?: string | null) =>
      s == null
        ? s
        : splitTikz(s)
            .map((seg) => (seg.type === "tikz" ? `QQTIKZ${figs.push(seg.value) - 1}QQ` : seg.value))
            .join("");
    const stripped: QuestionItem = {
      ...q,
      raw: strip(q.raw) ?? q.raw,
      content: strip(q.content) ?? q.content,
      solution: strip(q.solution) ?? q.solution,
    };
    return { stripped, figs };
  }, [q]);
}

/** LatexRenderer, nhưng chèn hình TikZ tại các marker. */
const Rich: React.FC<{ content: string; figs: string[]; className?: string }> = ({ content, figs, className }) => {
  const parts = content.split(MARKER_SPLIT);
  if (parts.length === 1) return <LatexRenderer content={content} className={className} />;
  return (
    <div className={className}>
      {parts.map((part, i) => {
        const m = part.match(MARKER_ONE);
        if (m) {
          const code = figs[Number(m[1])];
          return code ? <TikzFigure key={i} code={code} /> : null;
        }
        return part.trim() ? <LatexRenderer key={i} content={part} /> : null;
      })}
    </div>
  );
};

interface Props {
  question: QuestionItem;
  showAnswer?: boolean;
  showSolution?: boolean;
}

/** Nội dung đầy đủ của một câu hỏi: đề, phương án, đáp án, lời giải. */
export const QuestionBody: React.FC<Props> = ({ question, showAnswer = true, showSolution = true }) => {
  const { stripped, figs } = useTikzStripped(question);
  const p = useParsed(stripped);

  return (
    <div className="space-y-3">
      <Rich content={p.stem} figs={figs} className="!text-[15px]" />

      {p.kind === "choice" && p.choices.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {p.choices.map((c) => {
            const hit = showAnswer && c.correct;
            return (
              <div
                key={c.label}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                  hit ? "border-emerald-500 bg-emerald-50" : "border-gray-200 bg-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    hit ? "bg-emerald-600 text-white" : "bg-[#4A0E17] text-white"
                  }`}
                >
                  {c.label}
                </span>
                <Rich content={c.text} figs={figs} className="min-w-0 flex-1" />
                {hit && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Đáp án đúng" />}
              </div>
            );
          })}
        </div>
      )}

      {p.kind === "tf" && p.choices.length > 0 && (
        <div className="space-y-2">
          {p.choices.map((c) => (
            <div key={c.label} className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
              <span className="mt-0.5 w-4 shrink-0 text-sm font-bold text-[#4A0E17]">{c.label})</span>
              <Rich content={c.text} figs={figs} className="min-w-0 flex-1" />
              {showAnswer && (
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${
                    c.correct ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {c.correct ? "Đúng" : "Sai"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {p.kind === "short" && showAnswer && p.answer && (
        <div className="rounded-md border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm">
          <span className="font-bold text-emerald-700">Đáp án: </span>
          <span className="inline-block align-middle">
            <LatexRenderer content={p.answer} className="inline" />
          </span>
        </div>
      )}

      {p.choices.length === 0 && p.kind !== "short" && p.kind !== "essay" && (
        <p className="text-xs italic text-gray-400">Chưa có dữ liệu phương án cho câu này.</p>
      )}

      {showSolution && p.solution && (
        <details className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-semibold text-[#4A0E17]">Lời giải</summary>
          <div className="mt-2">
            <Rich content={p.solution} figs={figs} />
          </div>
        </details>
      )}

      {/* Chỉ còn báo khi có hình KHÔNG phải TikZ (ví dụ \includegraphics) */}
      {p.hasFigure && figs.length === 0 && (
        <p className="text-[11px] italic text-amber-700">
          Câu có hình ảnh (không phải TikZ) – ứng dụng chưa dựng hình, xem trong mã LaTeX bên dưới.
        </p>
      )}

      {question.raw && (
        <details className="rounded-md border border-gray-200">
          <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-semibold text-gray-600">Mã LaTeX gốc</summary>
          <pre className="overflow-x-auto whitespace-pre-wrap border-t border-gray-200 bg-gray-50 p-3 font-mono text-[11.5px] text-gray-700">
            {question.raw}
          </pre>
        </details>
      )}
    </div>
  );
};