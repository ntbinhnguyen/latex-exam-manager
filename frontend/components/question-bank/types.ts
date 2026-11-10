export type QuestionType =
  | "Trắc nghiệm"
  | "Đúng sai"
  | "Đúng/Sai"
  | "Trả lời ngắn"
  | "Tự luận";

export type DifficultyLevel = 1 | 2 | 3 | 4;

export interface TreeNode {
  id: string;
  title: string;
  count: number;
  icon?: "stack" | "folder";
  children?: TreeNode[];
  level?: number;
  isOpenDefault?: boolean;
  /** Cấp của mục: lớp / chương / bài / loại câu hỏi / dạng toán (hoặc "unassigned" = chưa gắn ID, "pending" = chờ kiểm duyệt) */
  kind?: "grade" | "chapter" | "lesson" | "type" | "form" | "unassigned" | "pending";
  /** true = mục tự sinh (chưa khai báo trong file mục lục, dùng tên mặc định) */
  auto?: boolean;
}

export interface DifficultyStat {
  level: DifficultyLevel;
  count: number;
}

export interface TypeStat {
  type: "Trắc nghiệm" | "Đúng sai" | "Trả lời ngắn" | "Tự luận";
  count: number;
}

export interface StatsData {
  difficulties: DifficultyStat[];
  questionTypes: TypeStat[];
  total: number;
}

export interface QuestionItem {
  id: string;
  number: number;
  code: string;
  type: QuestionType;
  /** null = chưa gán mức độ */
  level: DifficultyLevel | null;
  /** Đề bài (đã bóc tách, dùng cho thẻ xem nhanh) */
  content: string;
  /** Mã LaTeX gốc \begin{ex}...\end{ex} (nếu có) */
  raw?: string;
  solution?: string;
  answer?: string;
  isSelected?: boolean;
  chapter?: string;
}

export type ViewMode = "grid" | "list";

export interface SortOption {
  field: "number" | "level" | "code";
  direction: "asc" | "desc";
}

export interface FilterState {
  searchTerm: string;
  selectedFolderId: string;
  levels: DifficultyLevel[];
  types: QuestionType[];
  page: number;
  totalPages: number;
  viewMode: ViewMode;
  sort: SortOption;
}

export const LEVEL_NAMES: Record<DifficultyLevel, string> = {
  1: "Nhận biết",
  2: "Thông hiểu",
  3: "Vận dụng",
  4: "Vận dụng cao",
};


/** Mức độ nghi trùng: gần như trùng hoàn toàn / tương tự cần xem / giống nhưng khác số liệu (chỉ là nhãn, không coi là trùng) */
export type DupKind = "exact" | "similar" | "diff_data";

/** Một câu khác (trong ngân hàng hoặc cũng đang chờ duyệt) bị nghi trùng với câu đang xét. */
export interface DupMatch {
  other_id: string;
  other_code: string | null;
  /** "active" / "hidden" = đã ở trong ngân hàng; "pending" = cũng đang chờ kiểm duyệt */
  other_status: string;
  /** 0..1 */
  similarity: number;
  kind: DupKind;
  /** true = khác ID (mức phụ, ngưỡng cao hơn) */
  cross_id: boolean;
}

export type DupMap = Record<string, DupMatch[]>;
