"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Tag } from "lucide-react";
import { Modal } from "./Modal";
import { QidAssigner, idForType, validateQid } from "./QidAssigner";
import type { QuestionItem, TreeNode } from "./types";
import { typeAbbrOfLabel, type TypeAbbr } from "@/lib/qid";
import { hasValidId } from "@/lib/tree";

interface Props {
  questions: QuestionItem[];
  treeData: TreeNode[];
  /** Gợi ý ID theo mục đang chọn trên cây (nếu có) */
  suggestId?: string;
  onApply: (updates: { id: string; code: string }[]) => Promise<{ success: number; failed: number; lastError: string }>;
  onClose: () => void;
}

/** Hộp thoại gắn / đổi ID hàng loạt cho nhiều câu hỏi đã chọn. */
export const BulkQidModal: React.FC<Props> = ({
  questions,
  treeData,
  suggestId,
  onApply,
  onClose,
}) => {
  const { commonType, mixedTypes } = useMemo(() => {
    const abbrs = Array.from(
      new Set(questions.map((q) => typeAbbrOfLabel(q.type)).filter((t): t is TypeAbbr => Boolean(t))),
    );
    return {
      commonType: abbrs.length === 1 ? abbrs[0] : undefined,
      mixedTypes: abbrs.length > 1,
    };
  }, [questions]);

  const [draftId, setDraftId] = useState<string>(() => {
    const firstValid = questions.find((q) => hasValidId(q));
    if (firstValid) return idForType(firstValid.code, commonType);
    if (suggestId) return idForType(suggestId, commonType);
    return "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const idError = validateQid(draftId, commonType);

  const handleSave = async () => {
    if (idError || busy || questions.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const updates = questions.map((q) => {
        const abbr = typeAbbrOfLabel(q.type);
        const code = abbr ? idForType(draftId, abbr) || draftId.trim() : draftId.trim();
        return { id: q.id, code };
      });
      const res = await onApply(updates);
      if (res.failed > 0 && res.success === 0) {
        setError(res.lastError || "Không thể cập nhật ID cho các câu đã chọn.");
        setBusy(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={
        <>
          <Tag className="h-4 w-4 text-amber-300" />
          <span>Đổi ID hàng loạt ({questions.length} câu)</span>
        </>
      }
      widthClass="max-w-2xl"
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            HỦY
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || Boolean(idError) || questions.length === 0}
            className="flex h-9 items-center gap-1.5 rounded bg-[#4A0E17] px-4 text-xs font-bold tracking-wide text-white transition hover:bg-[#5d1420] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {busy ? "ĐANG CẬP NHẬT…" : `ÁP DỤNG CHO ${questions.length} CÂU`}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-gray-800">
        <p className="text-xs leading-relaxed text-gray-600">
          Chọn ID mới để gắn cho toàn bộ <b>{questions.length}</b> câu hỏi đang chọn.
          {mixedTypes && (
            <> Các câu đang chọn có nhiều loại khác nhau — phần tiền tố loại (<code>TN</code>, <code>DS</code>, <code>TLN</code>, <code>TL</code>) sẽ tự động giữ đúng theo từng câu.</>
          )}
        </p>

        <QidAssigner
          type={commonType}
          value={draftId}
          onChange={setDraftId}
          treeData={treeData}
          disabled={busy}
        />

        {error && (
          <div className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
