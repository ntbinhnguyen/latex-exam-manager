export type TypeAbbr = "TN" | "DS" | "TLN" | "TL";
export type NodeKind = "grade" | "chapter" | "lesson" | "type" | "form";

export interface QidParts {
  type?: TypeAbbr | string;
  level?: string;
  grade?: string;
  chapter?: string;
  lesson?: string;
  form?: string;
}

export interface ParsedQid {
  parts: QidParts;
  legacy: boolean;
}

export const TYPE_LABEL: Record<string, string> = {
  TN: "Trắc nghiệm nhiều lựa chọn",
  DS: "Đúng/Sai",
  TLN: "Trả lời ngắn",
  TL: "Tự luận",
};

export const LEVEL_MAP: Record<string, string> = {
  M1: "Nhận biết",
  M2: "Thông hiểu",
  M3: "Vận dụng",
  M4: "Vận dụng cao",
};

// Cấu trúc mới: Loại.Mức.Lớp.Chương.Bài.Dạng
// Ví dụ: TN.M1.T0.C1.B3 hoặc TN.M1.T0.C1.B3.01
const QID_REGEX = /^([A-Z]+)\.(M[1-4])\.([A-Z0-9]+)\.(C\d+)\.(B\d+)(?:\.(\d+))?$/;

/**
 * Phân tách chuỗi ID thành các phần nhỏ
 */
export function parseQid(qid: string | null | undefined): ParsedQid | null {
  if (typeof qid !== "string" || !qid) return null;
  
  const match = qid.trim().toUpperCase().match(QID_REGEX);
  if (!match) {
    // Nếu không khớp regex mới, đánh dấu là legacy/lỗi để hiển thị cảnh báo
    return { parts: {}, legacy: true };
  }

  return {
    parts: {
      type: match[1],
      level: match[2],
      grade: match[3],
      chapter: match[4],
      lesson: match[5],
      form: match[6], // Có thể undefined nếu ID chỉ dừng ở Bài
    },
    legacy: false,
  };
}

/**
 * Ghép các phần nhỏ thành chuỗi ID hoàn chỉnh
 */
export function formatParts(parts: QidParts): string {
  const p: string[] = [];
  if (parts.type) p.push(parts.type);
  if (parts.level) p.push(parts.level);
  if (parts.grade) p.push(parts.grade);
  if (parts.chapter) p.push(parts.chapter);
  if (parts.lesson) p.push(parts.lesson);
  if (parts.form) p.push(parts.form);
  
  return p.join(".");
}

/**
 * Kiểm tra xem ID đã đủ điều kiện gán cho câu hỏi chưa (Yêu cầu tới tối thiểu cấp Bài)
 */
export function isAssignable(parsed: ParsedQid | null): boolean {
  if (!parsed || parsed.legacy) return false;
  const { type, level, grade, chapter, lesson } = parsed.parts;
  // Phải có đủ 5 thành phần cốt lõi
  return Boolean(type && level && grade && chapter && lesson);
}

/**
 * Khóa nhận diện (Node Key) của từng cấp trên cây mục lục: Lớp > Chương > Bài > Loại > Dạng.
 * Các cấp trên KHÔNG chứa Loại/Mức để cây không bị tách nhánh:
 *   grade   -> T2
 *   chapter -> T2.C1
 *   lesson  -> T2.C1.B1
 *   type    -> T2.C1.B1.TN
 *   form    -> TN.M1.T2.C1.B1.01 (chính là ID đầy đủ của câu hỏi)
 */
export function nodeKey(parts: QidParts, kind: NodeKind): string {
  const seg: (string | undefined)[] = [];
  switch (kind) {
    case "grade":
      seg.push(parts.grade);
      break;
    case "chapter":
      seg.push(parts.grade, parts.chapter);
      break;
    case "lesson":
      seg.push(parts.grade, parts.chapter, parts.lesson);
      break;
    case "type":
      seg.push(parts.grade, parts.chapter, parts.lesson, parts.type);
      break;
    case "form":
      return formatParts(parts);
  }
  return seg.filter(Boolean).join(".");
}

/**
 * Danh sách khóa của tất cả tổ tiên (Lớp -> Chương -> Bài -> Loại -> Dạng) của một ID câu hỏi
 */
export function ancestorKeys(parts: QidParts): string[] {
  const keys: string[] = [];
  if (parts.grade) keys.push(nodeKey(parts, "grade"));
  if (parts.chapter) keys.push(nodeKey(parts, "chapter"));
  if (parts.lesson) keys.push(nodeKey(parts, "lesson"));
  if (parts.type) keys.push(nodeKey(parts, "type"));
  if (parts.form) keys.push(nodeKey(parts, "form"));
  return keys;
}

const NODE_CHAPTER_RE = /^([A-Z0-9]+)\.(C\d+)$/;
const NODE_LESSON_RE = /^([A-Z0-9]+)\.(C\d+)\.(B\d+)$/;
const NODE_TYPE_RE = /^([A-Z0-9]+)\.(C\d+)\.(B\d+)\.([A-Z]+)$/;
const NODE_GRADE_RE = /^([A-Z]\d+)$/;

/**
 * Đọc một ID CHƯA ĐỦ (đang chọn dở), theo vị trí: Loại.Mức.Lớp.Chương.Bài.Dạng.
 * Phần nào chưa có hoặc sai định dạng thì để trống. VD: "TN.M1.T2" -> { type, level, grade };
 * "TN..T2" (chưa chọn Mức) -> { type, grade }.
 */
export function parsePartialQid(value: string | null | undefined): QidParts {
  const parts: QidParts = {};
  if (typeof value !== "string") return parts;
  const seg = value.trim().toUpperCase().split(".");
  const fields: [keyof QidParts, RegExp][] = [
    ["type", /^[A-Z]+$/],
    ["level", /^M[1-4]$/],
    ["grade", /^[A-Z0-9]+$/],
    ["chapter", /^C\d+$/],
    ["lesson", /^B\d+$/],
    ["form", /^\d+$/],
  ];
  fields.forEach(([key, re], i) => {
    const s = seg[i];
    if (s && re.test(s)) parts[key] = s;
  });
  return parts;
}

/** Ghép các phần (kể cả thiếu) thành chuỗi theo vị trí; phần thiếu ở giữa để trống ("TN..T2"), phần thiếu ở cuối bỏ đi. */
export function composePartial(parts: QidParts): string {
  const seg = [parts.type, parts.level, parts.grade, parts.chapter, parts.lesson, parts.form].map((s) => s ?? "");
  while (seg.length && !seg[seg.length - 1]) seg.pop();
  return seg.join(".");
}

export interface ParsedNodeId {
  /** ID chuẩn hoá của mục trên cây (đã viết hoa, đúng dạng nodeKey) */
  id: string;
  kind: NodeKind;
  parts: QidParts;
}

/**
 * Đọc một ID bất kỳ trong file mục lục (JSON/Excel): Lớp, Chương, Bài, Loại hoặc Dạng.
 * VD: "T2", "T2.C1", "T2.C1.B1", "T2.C1.B1.TN", "TN.M1.T2.C1.B1.01"
 */
export function parseNodeId(raw: string | null | undefined): ParsedNodeId | null {
  if (typeof raw !== "string" || !raw) return null;
  const s = raw.trim().toUpperCase();

  const full = parseQid(s);
  if (full && !full.legacy) {
    const kind: NodeKind = full.parts.form ? "form" : "type";
    return { id: nodeKey(full.parts, kind), kind, parts: full.parts };
  }

  let m: RegExpMatchArray | null;
  if ((m = s.match(NODE_TYPE_RE))) {
    const parts: QidParts = { grade: m[1], chapter: m[2], lesson: m[3], type: m[4] };
    return { id: nodeKey(parts, "type"), kind: "type", parts };
  }
  if ((m = s.match(NODE_LESSON_RE))) {
    const parts: QidParts = { grade: m[1], chapter: m[2], lesson: m[3] };
    return { id: nodeKey(parts, "lesson"), kind: "lesson", parts };
  }
  if ((m = s.match(NODE_CHAPTER_RE))) {
    const parts: QidParts = { grade: m[1], chapter: m[2] };
    return { id: nodeKey(parts, "chapter"), kind: "chapter", parts };
  }
  if ((m = s.match(NODE_GRADE_RE))) {
    const parts: QidParts = { grade: m[1] };
    return { id: nodeKey(parts, "grade"), kind: "grade", parts };
  }
  return null;
}

// Bổ sung các export còn thiếu cho lib/tree.ts

export const KIND_LABEL: Record<NodeKind, string> = {
    grade: "Lớp",
    chapter: "Chương",
    lesson: "Bài",
    type: "Loại câu hỏi",
    form: "Dạng toán",
  };
  
  /**
   * Tạo tiêu đề mặc định cho các node trên cây nếu không có sẵn
   */
  export function defaultTitle(parts: QidParts, kind: NodeKind): string {
    switch (kind) {
      case "grade":
        return parts.grade ? `Lớp ${parts.grade.replace('T', '')}` : "Lớp";
      case "chapter":
        return parts.chapter ? `Chương ${parts.chapter.replace('C', '')}` : "Chương";
      case "lesson":
        return parts.lesson ? `Bài ${parts.lesson.replace('B', '')}` : "Bài";
      case "type":
        return parts.type ? (TYPE_LABEL[parts.type as string] || (parts.type as string)) : "Loại";
      case "form":
        return parts.form ? `Dạng ${parts.form}` : "Dạng";
      default:
        return "";
    }
  }
  
  /**
   * Trích xuất số để sắp xếp thứ tự các node cùng cấp (VD: C1 -> 1, B12 -> 12)
   */
  const TYPE_ORDER: Record<string, number> = { TN: 1, DS: 2, TLN: 3, TL: 4 };

  export function siblingOrder(parts: QidParts, kind: NodeKind): number {
    if (kind === "type") return TYPE_ORDER[parts.type ?? ""] ?? 99;
    const val = parts[kind as keyof QidParts];
    if (!val) return 0;
    const match = (val as string).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }
  
  /**
   * Trả về mảng các ID tổ tiên của một ID câu hỏi
   */
  export function questionAncestors(qid: string): string[] {
    const parsed = parseQid(qid);
    if (!parsed || parsed.legacy) return [];
    return ancestorKeys(parsed.parts);
  }

  /**
 * Trích xuất mã Lớp (grade) từ chuỗi ID câu hỏi (ví dụ: lấy "T0" từ "TN.M1.T0.C1.B3.01")
 */
export function gradeOf(qid: string | null | undefined): string | undefined {
    if (!qid) return undefined;
    const parsed = parseQid(qid);
    if (!parsed || parsed.legacy) return undefined;
    return parsed.parts.grade;
  }

  /**
 * Chuyển đổi từ tên loại câu hỏi (label) sang mã viết tắt (TypeAbbr).
 * Nhận cả nhãn chuẩn lẫn các cách gọi ngắn/khác nhau của backend, bỏ qua dấu và hoa/thường:
 *   "Trắc nghiệm", "Trắc nghiệm nhiều lựa chọn", "TN"           -> "TN"
 *   "Đúng/Sai", "Đúng sai", "Trắc nghiệm đúng, sai", "DS"        -> "DS"
 *   "Trả lời ngắn", "TLN"                                        -> "TLN"
 *   "Tự luận", "TL"                                              -> "TL"
 */
export function typeAbbrOfLabel(label: string | null | undefined): TypeAbbr | undefined {
  if (typeof label !== "string" || !label) return undefined;

  const raw = label.trim();
  const upper = raw.toUpperCase();
  if (upper in TYPE_LABEL) return upper as TypeAbbr;

  const plain = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Nhãn chuẩn (so sánh không dấu)
  for (const [abbr, value] of Object.entries(TYPE_LABEL)) {
    if (plain === value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()) {
      return abbr as TypeAbbr;
    }
  }

  // Theo từ khoá — kiểm tra Đúng/Sai trước vì nhãn "Trắc nghiệm đúng, sai" cũng chứa "trắc nghiệm"
  if (/\bdung sai\b|true false/.test(plain)) return "DS";
  if (/\btra loi ngan\b|short answer/.test(plain)) return "TLN";
  if (/\btu luan\b|essay/.test(plain)) return "TL";
  if (/\btrac nghiem\b|nhieu lua chon|multiple choice/.test(plain)) return "TN";
  return undefined;
}