import type { DifficultyLevel, QuestionItem, QuestionType } from "@/components/question-bank/types";
import { parseNodeId } from "@/lib/qid";

export type SlotType = "Trắc nghiệm" | "Đúng/Sai" | "Trả lời ngắn" | "Tự luận";
export const SLOT_TYPES: SlotType[] = ["Trắc nghiệm", "Đúng/Sai", "Trả lời ngắn", "Tự luận"];

export interface MatrixRow {
  id: string;
  type: SlotType;
  /** id mục trên cây mục lục (dạng bài); null = chưa chọn */
  topicId: string | null;
  /** null = chưa chọn mức ("Mức?") */
  level: DifficultyLevel | null;
  /** câu hỏi đã chọn cho dòng này */
  questionId: string | null;
}

export type Counts = Record<SlotType, number>;

/** Cấu trúc đề tham khảo THPT QG (Toán): 12 TN + 4 Đúng/Sai + 6 Trả lời ngắn = 22 câu */
export const THPTQG: Counts = { "Trắc nghiệm": 12, "Đúng/Sai": 4, "Trả lời ngắn": 6, "Tự luận": 0 };

export interface SavedMatrix {
  id: string;
  name: string;
  savedAt: string;
  rows: MatrixRow[];
}

export const normType = (t: QuestionType): SlotType => (t === "Đúng sai" ? "Đúng/Sai" : t);

// id dòng chỉ cần duy nhất trong phiên làm việc (dùng bộ đếm, không dùng Date/Math.random để tương thích prerender).
// Mọi dòng đọc từ localStorage / kho / file đều được cấp id mới bằng hàm này.
let seq = 0;
export const newRowId = () => `r${seq++}`;

export const blankRow = (type: SlotType): MatrixRow => ({ id: newRowId(), type, topicId: null, level: null, questionId: null });

/** Dựng danh sách dòng theo số lượng từng kiểu, giữ lại các dòng cũ (theo thứ tự) nếu còn chỗ. */
export function makeRows(counts: Counts, prev: MatrixRow[] = []): MatrixRow[] {
  const out: MatrixRow[] = [];
  for (const t of SLOT_TYPES) {
    const old = prev.filter((r) => r.type === t);
    for (let i = 0; i < counts[t]; i++) out.push(old[i] ?? blankRow(t));
  }
  return out;
}

export function countRows(rows: MatrixRow[]): Counts {
  const c: Counts = { "Trắc nghiệm": 0, "Đúng/Sai": 0, "Trả lời ngắn": 0, "Tự luận": 0 };
  rows.forEach((r) => c[r.type]++);
  return c;
}

/**
 * Mức độ do Dạng toán quy định: mã của Dạng đã chứa mức (VD TN.M1.T2.C1.B1.01 → Mức 1).
 * Trả về null nếu mục đã chọn không phải một Dạng (Lớp/Chương/Bài/Loại) → mức độ được tự chọn.
 */
export function topicLevel(topicId: string | null | undefined): DifficultyLevel | null {
  const n = parseNodeId(topicId);
  if (!n || n.kind !== "form" || !n.parts.level) return null;
  return Number(n.parts.level.slice(1)) as DifficultyLevel;
}

/** Mức độ đang áp dụng cho dòng: theo Dạng nếu đã chọn Dạng, ngược lại theo mức người dùng chọn. */
export const rowLevel = (row: MatrixRow): DifficultyLevel | null => topicLevel(row.topicId) ?? row.level;

/** Đồng bộ mức độ lưu trong dòng với Dạng đã chọn (dùng khi nạp từ localStorage / kho / file). */
export const syncRowLevel = (row: MatrixRow): MatrixRow => {
  const lv = topicLevel(row.topicId);
  return lv && lv !== row.level ? { ...row, level: lv } : row;
};

export const effectiveLevel = (row: MatrixRow, q?: QuestionItem): DifficultyLevel | null => rowLevel(row) ?? q?.level ?? null;