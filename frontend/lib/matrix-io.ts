import type { QuestionItem, TreeNode } from "@/components/question-bank/types";
import {
  SLOT_TYPES,
  blankRow,
  effectiveLevel,
  normType,
  syncRowLevel,
  topicLevel,
  type MatrixRow,
  type SlotType,
} from "@/components/matrix/types";
import { stripSolution } from "@/lib/exam-parser";
import { norm } from "@/lib/tree";
import { embedQid } from "@/lib/qid";
import { downloadBlob } from "@/lib/download";

/**
 * Khối LaTeX của một câu hỏi: dùng mã gốc nếu có, không thì bọc đề bài trong \begin{ex}.
 * ID luôn được ghi ở dòng đầu theo định dạng:  \begin{ex}%[TN.M2.T2.C1.B3.05]
 */
export function questionTex(q: QuestionItem, solutions: boolean): string {
  const base = q.raw?.trim() ? q.raw.trim() : `\\begin{ex}\n${q.content}\n\\end{ex}`;
  const raw = embedQid(base, q.code);
  return solutions ? raw : stripSolution(raw);
}

/** Tạo nội dung .tex gồm các khối \begin{ex}...\end{ex}, sẵn sàng \input hoặc dán vào main.tex. */
export function buildTex(list: QuestionItem[], opts: { name: string; solutions: boolean }): string {
  const head = [
    `% ===== ${opts.name} =====`,
    `% Xuất ngày ${new Date().toLocaleDateString("vi-VN")} – ${list.length} câu${opts.solutions ? " (kèm lời giải)" : " (không lời giải)"}`,
    `% Dán các khối dưới đây vào thân tài liệu của main.tex (gói ex_test).`,
    "",
  ];
  const body = list.map((q) => `${questionTex(q, opts.solutions)}\n`);
  return [...head, ...body].join("\n");
}

interface Ctx {
  rows: MatrixRow[];
  qById: Map<string, QuestionItem>;
  nodeMap: Map<string, TreeNode>;
}

/** Thứ tự câu trong từng phần (Trắc nghiệm 1..n, Đúng/Sai 1..n, ...), giống bảng trên màn hình. */
function withIndex(rows: MatrixRow[]): { row: MatrixRow; idx: number }[] {
  const counter: Record<string, number> = {};
  return rows.map((row) => {
    counter[row.type] = (counter[row.type] ?? 0) + 1;
    return { row, idx: counter[row.type] };
  });
}

export async function exportMatrixXlsx(ctx: Ctx, name: string): Promise<void> {
  const XLSX = await import("xlsx");
  const data = withIndex(ctx.rows).map(({ row, idx }) => {
    const q = row.questionId ? ctx.qById.get(row.questionId) : undefined;
    return {
      "Câu": idx,
      "Kiểu": row.type,
      "Mã dạng bài": row.topicId ?? "",
      "Tên dạng bài": row.topicId ? (ctx.nodeMap.get(row.topicId)?.title ?? "") : "",
      // Dòng đã chọn Dạng toán thì mức độ do Dạng quy định (mã Dạng chứa M1–M4)
      "Mức độ": effectiveLevel(row, q) ?? "",
      "Mã câu hỏi": q?.code ?? "",
      "ID câu hỏi": q?.id ?? "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 60 }, { wch: 9 }, { wch: 24 }, { wch: 38 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ma trận");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(new Blob([buf]), `${slug(name)}.xlsx`);
}

export function exportMatrixJson(rows: MatrixRow[], name: string): void {
  downloadBlob(new Blob([JSON.stringify({ name, rows }, null, 2)], { type: "application/json" }), `${slug(name)}.json`);
}

export const slug = (s: string): string => norm(s).replace(/_/g, "-") || "ma-tran";

function toSlotType(v: unknown): SlotType {
  const t = norm(String(v ?? ""));
  if (t.includes("dung") || t.includes("sai")) return "Đúng/Sai";
  if (t.includes("ngan")) return "Trả lời ngắn";
  if (t.includes("tu_luan")) return "Tự luận";
  return "Trắc nghiệm";
}

function toLevel(v: unknown): 1 | 2 | 3 | 4 | null {
  const m = /([1-4])/.exec(String(v ?? ""));
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4) : null;
}

const field = (o: Record<string, unknown>, names: string[]): unknown => {
  for (const k of Object.keys(o)) if (names.includes(norm(k))) return o[k];
  return undefined;
};

/** Đọc ma trận từ .xlsx (xuất bởi chính ứng dụng hoặc tự soạn) hoặc .json. */
export async function importMatrixFile(
  file: File,
  qById: Map<string, QuestionItem>,
  questions: QuestionItem[],
  nodeMap: Map<string, TreeNode>,
): Promise<{ rows: MatrixRow[]; warnings: string[] }> {
  const name = file.name.toLowerCase();
  let items: Record<string, unknown>[] = [];

  if (name.endsWith(".json")) {
    const j = JSON.parse(await file.text()) as unknown;
    const arr = Array.isArray(j) ? j : (j as { rows?: unknown }).rows;
    if (!Array.isArray(arr)) throw new Error('JSON phải là mảng dòng ma trận hoặc có khóa "rows".');
    items = arr as Record<string, unknown>[];
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("File Excel không có sheet nào.");
    items = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  } else {
    throw new Error("Chỉ hỗ trợ file .xlsx hoặc .json");
  }
  if (items.length === 0) throw new Error("File không có dòng dữ liệu nào.");

  const warnings: string[] = [];
  const used = new Set<string>();
  const rows: MatrixRow[] = items.map((it, i) => {
    const row = blankRow(toSlotType(field(it, ["kieu", "type", "loai"])));
    const topic = String(field(it, ["ma_dang_bai", "ma_dang", "topicid", "topic_id", "topic"]) ?? "").trim();
    if (topic) {
      if (nodeMap.has(topic)) row.topicId = topic;
      else warnings.push(`Dòng ${i + 1}: mã dạng bài "${topic}" không có trên cây mục lục – bỏ trống.`);
    }
    row.level = toLevel(field(it, ["muc_do", "muc", "level"]));
    // Dạng toán đã quy định sẵn mức độ → luôn dùng mức theo Dạng, bỏ qua mức ghi trong file nếu lệch
    const lockedLevel = topicLevel(row.topicId);
    if (lockedLevel && row.level && row.level !== lockedLevel) {
      warnings.push(`Dòng ${i + 1}: mức độ ${row.level} khác mức của Dạng đã chọn (Mức ${lockedLevel}) – dùng Mức ${lockedLevel}.`);
    }

    const qid = String(field(it, ["id_cau_hoi", "questionid", "question_id"]) ?? "").trim();
    const code = String(field(it, ["ma_cau_hoi", "code"]) ?? "").trim();
    let q = qid ? qById.get(qid) : undefined;
    if (!q && code) q = questions.find((x) => x.code === code && !used.has(x.id) && normType(x.type) === row.type);
    if (q && !used.has(q.id)) {
      used.add(q.id);
      row.questionId = q.id;
    } else if (qid || code) {
      warnings.push(`Dòng ${i + 1}: không tìm thấy câu hỏi "${code || qid}" trong ngân hàng.`);
    }
    return syncRowLevel(row);
  });
  // đảm bảo thứ tự theo kiểu giống bảng
  rows.sort((a, b) => SLOT_TYPES.indexOf(a.type) - SLOT_TYPES.indexOf(b.type));
  return { rows, warnings };
}