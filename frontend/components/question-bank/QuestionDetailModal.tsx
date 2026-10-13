"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { LevelChips } from "./LevelChips";
import { QuestionBody } from "./QuestionBody";
import { QidAssigner, idForType, validateQid } from "./QidAssigner";
import type { QuestionItem, TreeNode } from "./types";
import { flattenTree, hasValidId } from "@/lib/tree";
import { ancestorKeys, isAssignable, parseQid, typeAbbrOfLabel } from "@/lib/qid";

interface Props {
  question: QuestionItem;
  /** Cây mục lục (dùng cho form gắn ID); bỏ trống nếu chỉ xem */
  treeData?: TreeNode[];
  /** Mã mục đang xem trên cây – gợi ý sẵn khi gắn ID cho câu chưa có ID */
  suggestId?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onAddQuestion?: (id: string) => void;
  position?: string;
  onSaveContent?: (id: string, raw: string) => Promise<void>;
  onSaveId?: (id: string, code: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

type Mode = "view" | "edit" | "assign";

const NO_TREE: TreeNode[] = [];

const btnGhost =
  "flex h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

export const QuestionDetailModal: React.FC<Props> = ({
  question,
  treeData = NO_TREE,
  suggestId,
  onClose,
  onPrev,
  onNext,
  isSelected,
  onToggleSelect,
  onAddQuestion,
  position,
  onSaveContent,
  onSaveId,
  onDelete,
}) => {
  const [mode, setMode] = useState<Mode>("view");
  const [draftRaw, setDraftRaw] = useState("");
  const [draftId, setDraftId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const typeAbbr = typeAbbrOfLabel(question.type);
  const validId = hasValidId(question);
  const parsedCode = parseQid(question.code);
  const nodes = useMemo(() => new Map(flattenTree(treeData).map((n) => [n.id, n])), [treeData]);
  const trail =
    parsedCode && isAssignable(parsedCode) ? ancestorKeys(parsedCode.parts).map((k) => nodes.get(k)?.title ?? k) : [];

  const editing = mode !== "view";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, editing]);

  const startEdit = () => {
    setDraftRaw(question.raw ?? `\\begin{ex}\n${question.content}\n\\end{ex}`);
    setError("");
    setMode("edit");
  };

  const startAssign = () => {
    const own = validId ? idForType(question.code, typeAbbr) : "";
    setDraftId(own || (suggestId ? idForType(suggestId, typeAbbr) : ""));
    setError("");
    setMode("assign");
  };

  const cancel = () => {
    setMode("view");
    setError("");
  };

  const run = async (fn: () => Promise<void>, done?: () => void) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      done?.();
    } catch (e) {
      console.error("[QuestionDetailModal] Lỗi khi lưu:", e);
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  };

  const saveContent = () =>
    run(
      () => onSaveContent!(question.id, draftRaw.trim()),
      () => setMode("view"),
    );
  const saveId = () =>
    run(
      () => onSaveId!(question.id, draftId),
      () => setMode("view"),
    );
  const remove = () => {
    const ok = window.confirm(
      `Xóa câu này khỏi ngân hàng?\n\n${validId ? question.code : "(chưa có ID)"}\n\nCâu hỏi sẽ được ẩn (xóa mềm) và không còn xuất hiện trong ngân hàng.`,
    );
    if (ok) run(() => onDelete!(question.id));
  };

  const idError = mode === "assign" ? validateQid(draftId, typeAbbr) : null;
  const dirtyRaw = mode === "edit" && draftRaw.trim() !== (question.raw ?? "").trim();
  const previewQuestion: QuestionItem = useMemo(() => ({ ...question, raw: draftRaw }), [question, draftRaw]);

  const footer =
    mode === "view" ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onPrev} disabled={!onPrev} className={btnGhost}>
            <ChevronLeft className="h-3.5 w-3.5" /> Câu trước
          </button>
          <button type="button" onClick={onNext} disabled={!onNext} className={btnGhost}>
            Câu sau <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {position && <span className="pl-1 text-xs text-gray-500">{position}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {onAddQuestion && (
            <button
              type="button"
              onClick={() => onAddQuestion(question.id)}
              className="flex h-8 items-center gap-1 rounded border border-[#4A0E17] bg-white px-3 text-xs font-semibold text-[#4A0E17] transition hover:bg-[#4A0E17]/5"
            >
              <Plus className="h-3.5 w-3.5" /> THÊM VÀO ĐỀ
            </button>
          )}
          {onToggleSelect && (
            <button
              type="button"
              onClick={() => onToggleSelect(question.id)}
              className={`flex h-8 items-center gap-1 rounded px-3 text-xs font-semibold transition ${
                isSelected ? "bg-[#EAB308] text-slate-950" : "bg-[#4A0E17] text-white hover:bg-[#5d1420]"
              }`}
            >
              <Check className="h-3.5 w-3.5" /> {isSelected ? "ĐÃ CHỌN" : "CHỌN CÂU NÀY"}
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {mode === "edit"
            ? "Loại câu, đáp án và lời giải sẽ được nhận dạng lại khi lưu."
            : "Chọn lần lượt Lớp → Chương → Bài → Dạng, hoặc gõ ID trực tiếp."}
        </span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={cancel} disabled={busy} className={btnGhost}>
            Hủy
          </button>
          <button
            type="button"
            onClick={mode === "edit" ? saveContent : saveId}
            disabled={busy || (mode === "edit" ? !dirtyRaw || !draftRaw.trim() : Boolean(idError))}
            className="flex h-8 items-center gap-1 rounded bg-[#4A0E17] px-3 text-xs font-semibold text-white transition hover:bg-[#5d1420] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> {busy ? "ĐANG LƯU…" : mode === "edit" ? "LƯU NỘI DUNG" : "LƯU ID"}
          </button>
        </div>
      </div>
    );

  return (
    <Modal
      widthClass="max-w-3xl"
      onClose={editing ? cancel : onClose}
      title={
        <>
          <span>Câu {question.number}</span>
          <span className="rounded bg-[#EAB308] px-1.5 py-0.5 text-[11px] font-bold text-slate-900">{question.type}</span>
        </>
      }
      headerExtra={<LevelChips level={question.level} />}
      footer={footer}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {validId ? (
              <span className="text-xs font-bold tracking-wide text-slate-700">{question.code}</span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                <AlertTriangle className="h-3 w-3" /> Chưa gắn ID
              </span>
            )}
            {validId && parsedCode?.legacy && (
              <span
                className="rounded bg-sky-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-800"
                title="Bấm “Gắn ID” rồi “Lưu ID” để đổi sang mã mới"
              >
                Mã cũ
              </span>
            )}
          </div>
          {trail.length > 0 && <div className="mt-0.5 text-[11px] text-gray-500">{trail.join("  ›  ")}</div>}
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5">
            {onSaveId && (
              <button type="button" onClick={startAssign} className={btnGhost} title="Gắn / đổi ID câu hỏi">
                <Tag className="h-3.5 w-3.5" /> {validId && !parsedCode?.legacy ? "Đổi ID" : "Gắn ID"}
              </button>
            )}
            {onSaveContent && (
              <button type="button" onClick={startEdit} className={btnGhost} title="Sửa mã LaTeX của câu hỏi">
                <Pencil className="h-3.5 w-3.5" /> Sửa nội dung
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                title="Xóa câu hỏi khỏi ngân hàng"
                className="flex h-8 items-center gap-1 rounded border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Xóa
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {mode === "assign" && (
        <div className="mb-4">
          <QidAssigner type={typeAbbr} value={draftId} onChange={setDraftId} treeData={treeData} disabled={busy} />
        </div>
      )}

      {mode === "edit" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">
              Mã LaTeX (<code>\begin&#123;ex&#125; … \end&#123;ex&#125;</code>)
            </span>
            <textarea
              value={draftRaw}
              onChange={(e) => setDraftRaw(e.target.value)}
              disabled={busy}
              spellCheck={false}
              rows={14}
              className="w-full resize-y rounded border border-gray-300 bg-white p-2.5 font-mono text-[12px] leading-relaxed text-gray-800 focus:border-[#4A0E17] focus:outline-hidden"
            />
          </label>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600">Xem trước</div>
            <div className="rounded border border-dashed border-gray-300 p-3">
              <QuestionBody question={previewQuestion} />
            </div>
          </div>
        </div>
      ) : (
        <QuestionBody question={question} />
      )}
    </Modal>
  );
};