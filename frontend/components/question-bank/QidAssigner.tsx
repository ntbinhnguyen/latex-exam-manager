"use client";

import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TreeNode } from "./types";
import { flattenTree } from "@/lib/tree";
import {
  TYPE_LABEL,
  ancestorKeys,
  composePartial,
  formatParts,
  isAssignable,
  nodeKey,
  parseNodeId,
  parsePartialQid,
  parseQid,
  type NodeKind,
  type QidParts,
  type TypeAbbr,
} from "@/lib/qid";

interface Props {
  /** Loại câu hỏi hiện tại (TN/DS/TLN/TL) – cố định, vì ID luôn khớp loại câu. Có thể chưa nhận dạng được. */
  type?: TypeAbbr;
  value: string;
  onChange: (id: string) => void;
  treeData: TreeNode[];
  disabled?: boolean;
}

/**
 * Đưa mã/khóa mục trên cây (T2, T2.C1, T2.C1.B1, T2.C1.B1.TN, hoặc ID đầy đủ) về ID dùng cho câu hỏi loại `type`.
 * Kết quả có thể chưa đủ (VD "TN..T2.C1" khi chưa chọn Mức độ) – người dùng chọn tiếp các cấp còn lại.
 */
export function idForType(code: string, type?: TypeAbbr): string {
  const n = parseNodeId(code);
  if (!n) return "";
  const parts: QidParts = { ...n.parts };
  if (type) {
    // Dạng của loại câu khác thì không dùng lại được
    if (parts.type && parts.type !== type) delete parts.form;
    parts.type = type;
  }
  return composePartial(parts);
}

/** Kiểm tra ID đang nhập; trả về thông báo lỗi hoặc null nếu dùng được. */
export function validateQid(value: string, type?: TypeAbbr): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  const partial = parsePartialQid(v);
  if (!type && !partial.type) {
    return "Chưa nhận dạng được loại câu – hãy gõ ID đầy đủ, bắt đầu bằng TN, DS hoặc TLN.";
  }
  if (!v) return "Chưa có ID.";

  const p = parseQid(v);
  if (p && !p.legacy) {
    if (!isAssignable(p)) return "Cần chọn tới Bài (ID dạng TN.M1.T0.C1.B3 hoặc TN.M1.T0.C1.B3.01).";
    if (type && p.parts.type !== type) {
      return `Loại trong ID (${p.parts.type}) khác loại của câu hỏi (${type}). Hãy sửa nội dung nếu muốn đổi loại câu.`;
    }
    return null;
  }

  // Chưa đủ: chỉ rõ còn thiếu cấp nào
  if (!partial.level) return "Chưa chọn Mức độ.";
  if (!partial.grade) return "Chưa chọn Lớp.";
  if (!partial.chapter) return "Chưa chọn Chương.";
  if (!partial.lesson) return "Chưa chọn Bài.";
  return "ID chưa đúng định dạng, ví dụ TN.M1.T0.C1.B3.01.";
}

const selectCls =
  "h-8 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-800 focus:border-[#4A0E17] focus:outline-hidden disabled:bg-gray-100 disabled:text-gray-400";

export const QidAssigner: React.FC<Props> = ({ type, value, onChange, treeData, disabled }) => {
  const nodes = useMemo(() => new Map(flattenTree(treeData).map((n) => [n.id, n])), [treeData]);

  // ID có thể đang dở dang → đọc theo vị trí, không đòi đủ định dạng
  const parts = useMemo(() => parsePartialQid(value), [value]);
  const effType = type ?? parts.type;
  const noType = !effType;

  const kids = (id: string | null, kind: NodeKind): TreeNode[] =>
    (id ? (nodes.get(id)?.children ?? []) : (treeData[0]?.children ?? [])).filter((n) => n.kind === kind);

  const gradeKey = parts.grade ? nodeKey(parts, "grade") : null;
  const chapterKey = gradeKey && parts.chapter ? nodeKey(parts, "chapter") : null;
  const lessonKey = chapterKey && parts.lesson ? nodeKey(parts, "lesson") : null;
  const typeKey = lessonKey && effType ? nodeKey({ ...parts, type: effType }, "type") : null;
  const formKey = lessonKey && parts.level && parts.form ? formatParts({ ...parts, type: effType }) : null;

  const emit = (p: QidParts) => {
    const next = composePartial(p);
    onChange(next === (effType ?? "") ? "" : next);
  };
  const base: QidParts = { type: effType, level: parts.level };

  const pickLevel = (level: string) => {
    const next: QidParts = { ...parts, type: effType, level: level || undefined };
    // Dạng gắn liền với Mức độ → đổi Mức thì bỏ Dạng nếu Dạng đó không tồn tại ở mức mới
    if (next.form && (!level || !nodes.has(formatParts(next)))) delete next.form;
    emit(next);
  };
  const pickGrade = (key: string) => {
    emit({ ...base, grade: key ? parseNodeId(key)?.parts.grade : undefined });
  };
  const pickChapter = (key: string) => {
    emit({ ...base, grade: parts.grade, chapter: key ? parseNodeId(key)?.parts.chapter : undefined });
  };
  const pickLesson = (key: string) => {
    emit({
      ...base,
      grade: parts.grade,
      chapter: parts.chapter,
      lesson: key ? parseNodeId(key)?.parts.lesson : undefined,
    });
  };
  const pickForm = (key: string) => {
    const n = key ? parseNodeId(key) : null;
    if (n && n.kind === "form") {
      emit({ ...n.parts, type: effType }); // Dạng đã quy định sẵn Mức độ trong mã của nó
    } else {
      emit({ ...base, grade: parts.grade, chapter: parts.chapter, lesson: parts.lesson });
    }
  };

  // Mỗi Dạng đã quy định sẵn Mức độ trong mã (VD …B1.01 thuộc M1) → liệt kê tất cả Dạng của Loại,
  // kèm nhãn mức; chọn Dạng thì Mức độ tự được điền theo Dạng đó.
  const formOptions = kids(typeKey, "form").map((n) => {
    const lv = parseNodeId(n.id)?.parts.level;
    return { id: n.id, label: lv ? `[${lv}] ${n.title}` : n.title };
  });
  const levelLocked = Boolean(formKey); // đã chọn Dạng → Mức độ do Dạng quyết định

  const err = validateQid(value, type);
  const full = parseQid(value);
  const trail =
    full && !full.legacy && isAssignable(full)
      ? ancestorKeys({ ...full.parts, type: effType }).map((k) => nodes.get(k)?.title ?? k)
      : [];

  return (
    <div className="space-y-2.5 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">
            Mức độ {levelLocked && <em className="font-normal not-italic text-gray-400">(theo Dạng)</em>}
          </span>
          <select
            className={selectCls}
            disabled={disabled || noType || levelLocked}
            value={parts.level ?? ""}
            title={levelLocked ? "Mức độ do Dạng toán đã chọn quy định – bỏ chọn Dạng để đổi" : undefined}
            onChange={(e) => pickLevel(e.target.value)}
          >
            <option value="">— Chọn —</option>
            <option value="M1">Nhận biết (M1)</option>
            <option value="M2">Thông hiểu (M2)</option>
            <option value="M3">Vận dụng (M3)</option>
            <option value="M4">Vận dụng cao (M4)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">Lớp</span>
          <select
            className={selectCls}
            disabled={disabled || noType}
            value={gradeKey ?? ""}
            onChange={(e) => pickGrade(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {kids(null, "grade").map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">Chương</span>
          <select
            className={selectCls}
            disabled={disabled || !gradeKey}
            value={chapterKey ?? ""}
            onChange={(e) => pickChapter(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {kids(gradeKey, "chapter").map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">Bài</span>
          <select
            className={selectCls}
            disabled={disabled || !chapterKey}
            value={lessonKey ?? ""}
            onChange={(e) => pickLesson(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {kids(chapterKey, "lesson").map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">
            Dạng toán <em className="font-normal not-italic text-gray-400">(tùy chọn)</em>
          </span>
          <select
            className={selectCls}
            disabled={disabled || !lessonKey}
            value={formKey ?? ""}
            onChange={(e) => pickForm(e.target.value)}
          >
            <option value="">— Chưa xếp dạng —</option>
            {formOptions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] font-semibold text-gray-500">Loại câu hỏi</span>
        <span className="rounded bg-[#EAB308] px-1.5 py-0.5 text-[11px] font-bold text-slate-900">
          {effType ? `${effType} – ${TYPE_LABEL[effType] ?? effType}` : "–"}
        </span>
        <span className="text-[10.5px] text-gray-400">(tự theo loại của câu)</span>
      </div>

      <label className="block">
        <span className="mb-0.5 block text-[10.5px] font-semibold text-gray-500">
          ID câu hỏi – có thể gõ trực tiếp để tạo Bài/Dạng mới
        </span>
        <input
          type="text"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
          placeholder="TN.M1.T0.C1.B3.01"
          className="h-8 w-full rounded border border-gray-300 bg-white px-2 font-mono text-xs tracking-wide text-gray-900 focus:border-[#4A0E17] focus:outline-hidden"
        />
      </label>

      {err ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {err}
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> {trail.join("  ›  ")}
        </p>
      )}
    </div>
  );
};