import type { QuestionItem, TreeNode } from "@/components/question-bank/types";
import {
  KIND_LABEL,
  defaultTitle,
  isAssignable,
  nodeKey,
  parseNodeId,
  parseQid,
  questionAncestors,
  siblingOrder,
  type NodeKind,
  type QidParts,
} from "@/lib/qid";

export interface FlatRow {
  id: string;
  title: string;
}

export interface TreeParseResult {
  rows: FlatRow[];
  warnings: string[];
}

export const UNASSIGNED_ID = "unassigned";

export const norm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ALIASES = {
  id: ["id", "ma", "ma_muc", "ma_dang", "code"],
  title: ["title", "ten", "ten_muc", "tieu_de", "name", "noi_dung"],
  children: ["children", "con", "items", "muc_con"],
} as const;

export function pickField(obj: Record<string, unknown>, key: keyof typeof ALIASES): unknown {
  for (const k of Object.keys(obj)) {
    if ((ALIASES[key] as readonly string[]).includes(norm(k))) return obj[k];
  }
  return undefined;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

/** Mức độ lấy trực tiếp từ chuỗi ID mới (VD: TN.M1.T0... trả về 1) */
export function levelFromCode(code: string): 1 | 2 | 3 | 4 | null {
  const m = /\.M([1-4])\./i.exec(code.trim());
  return m ? (Number(m[1]) as 1 | 2 | 3 | 4) : null;
}

/** Câu hỏi có ID hợp lệ (tới cấp Loại trở xuống) hay chưa. */
export const hasValidId = (q: Pick<QuestionItem, "code">): boolean => isAssignable(parseQid(q.code));

export const belongsTo = (q: Pick<QuestionItem, "code">, nodeId: string): boolean => {
  if (nodeId === "all") return true;
  if (nodeId === UNASSIGNED_ID) return !hasValidId(q);
  
  // Với ID mới, ta kiểm tra xem nodeId có nằm trong ancestorKeys hoặc bắt đầu bằng nodeId
  const ancestors = questionAncestors(q.code);
  return ancestors.includes(nodeId) || q.code === nodeId || q.code.startsWith(nodeId + ".");
};

export function rowsFromObjects(items: Record<string, unknown>[]): TreeParseResult {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const rows: FlatRow[] = [];

  items.forEach((it, idx) => {
    const raw = str(pickField(it, "id"));
    if (!raw) {
      warnings.push(`Dòng ${idx + 1}: thiếu cột id – bỏ qua.`);
      return;
    }
    const parsed = parseNodeId(raw);
    if (!parsed) {
      warnings.push(
        `Dòng ${idx + 1}: mã "${raw}" không đúng định dạng (VD: T2, T2.C1, T2.C1.B1, T2.C1.B1.TN hoặc TN.M1.T2.C1.B1.01) – bỏ qua.`,
      );
      return;
    }
    const id = parsed.id;
    if (seen.has(id)) {
      warnings.push(`Mã "${id}" bị trùng – giữ dòng đầu tiên.`);
      return;
    }
    seen.add(id);
    rows.push({ id, title: str(pickField(it, "title")) });
  });

  return { rows, warnings };
}

function flattenNested(nodes: unknown[], out: Record<string, unknown>[]) {
  nodes.forEach((n) => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    out.push({ id: pickField(obj, "id"), title: pickField(obj, "title") });
    const kids = pickField(obj, "children");
    if (Array.isArray(kids)) flattenNested(kids, out);
  });
}

export function parseTreeJson(data: unknown): TreeParseResult {
  let arr: unknown = data;
  if (!Array.isArray(arr) && arr && typeof arr === "object") {
    const o = arr as Record<string, unknown>;
    arr = o.tree ?? o.nodes ?? o.data ?? o.items;
  }
  if (!Array.isArray(arr)) throw new Error('JSON phải là một mảng các mục (hoặc có khóa "tree"/"nodes").');

  const hasChildren = arr.some(
    (n) => n && typeof n === "object" && Array.isArray(pickField(n as Record<string, unknown>, "children")),
  );
  if (hasChildren) {
    const flat: Record<string, unknown>[] = [];
    flattenNested(arr, flat);
    return rowsFromObjects(flat);
  }
  return rowsFromObjects(arr as Record<string, unknown>[]);
}

export async function parseTreeXlsx(file: File): Promise<TreeParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => ["muc_luc", "mucluc", "tree", "cay"].includes(norm(n))) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("File Excel không có sheet nào.");
  const items = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (items.length === 0) throw new Error("Sheet đầu tiên không có dữ liệu.");
  return rowsFromObjects(items);
}

export async function parseTreeFile(file: File): Promise<TreeParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) return parseTreeJson(JSON.parse(await file.text()));
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseTreeXlsx(file);
  throw new Error("Chỉ hỗ trợ file .json hoặc .xlsx");
}

interface Draft {
  id: string;
  parts: QidParts;
  kind: NodeKind;
  title: string;
  auto: boolean;
  parent: string;
}

/**
 * Dựng cây từ danh sách phẳng (Lớp -> Chương -> Bài -> Loại -> Dạng).
 */
export function buildTree(rows: FlatRow[], extraCodes: Iterable<string> = []): TreeNode[] {
  const drafts = new Map<string, Draft>();

  const CHAIN: NodeKind[] = ["grade", "chapter", "lesson", "type", "form"];

  // Dựng chuỗi Lớp -> Chương -> Bài -> Loại -> Dạng cho một mục; chỉ mục đích danh mới nhận title.
  const ensure = (parts: QidParts, title: string | null, targetKind: NodeKind) => {
    let parent = "";
    CHAIN.slice(0, CHAIN.indexOf(targetKind) + 1).forEach((kind) => {
      const key = nodeKey(parts, kind);
      const isTarget = kind === targetKind;
      const existing = drafts.get(key);

      if (!existing) {
        drafts.set(key, {
          id: key,
          parts,
          kind,
          title: isTarget && title ? title : defaultTitle(parts, kind),
          auto: !(isTarget && title),
          parent,
        });
      } else if (isTarget && title && existing.auto) {
        existing.title = title;
        existing.auto = false;
      }
      parent = key;
    });
  };

  rows.forEach((r) => {
    const p = parseNodeId(r.id);
    if (p) ensure(p.parts, r.title.trim() || null, p.kind);
  });

  for (const code of extraCodes) {
    const p = parseQid(code);
    if (p && !p.legacy && isAssignable(p)) ensure(p.parts, null, p.parts.form ? "form" : "type");
  }

  const children = new Map<string, Draft[]>();
  drafts.forEach((d) => children.set(d.parent, [...(children.get(d.parent) ?? []), d]));
  
  const sortKids = (ds: Draft[]) =>
    [...ds].sort(
      (a, b) =>
        (a.parts.grade || "").localeCompare(b.parts.grade || "") ||
        siblingOrder(a.parts, a.kind) - siblingOrder(b.parts, b.kind),
    );

  const make = (d: Draft, level: number): TreeNode => {
    const kids = sortKids(children.get(d.id) ?? []);
    return {
      id: d.id,
      title: d.title,
      count: 0,
      icon: "folder",
      level,
      kind: d.kind,
      auto: d.auto && d.kind !== "type",
      children: kids.length ? kids.map((k) => make(k, level + 1)) : undefined,
    };
  };
  return sortKids(children.get("") ?? []).map((d) => make(d, 1));
}

/** Thêm nút gốc "Tất cả" (+ nút "Chưa gắn ID" nếu có) và tính số câu cho từng mục. */
export function withCounts(roots: TreeNode[], questions: QuestionItem[]): TreeNode[] {
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const q of questions) {
    const keys = questionAncestors(q.code);
    if (keys.length === 0) unassigned++;
    keys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  }
  const apply = (n: TreeNode): TreeNode => ({
    ...n,
    count: counts.get(n.id) ?? 0,
    children: n.children?.map(apply),
  });
  const children = roots.map(apply);
  
  if (unassigned > 0) {
    children.push({
      id: UNASSIGNED_ID,
      title: "Chưa gắn ID / Lỗi ID",
      count: unassigned,
      icon: "folder",
      level: 1,
      kind: "unassigned" as any,
    });
  }
  return [
    {
      id: "all",
      title: "Tất cả",
      count: questions.length,
      icon: "stack",
      level: 0,
      children,
    } as TreeNode,
  ];
}

export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (ns: TreeNode[]) =>
    ns.forEach((n) => {
      out.push(n);
      if (n.children) walk(n.children);
    });
  walk(nodes);
  return out;
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  return flattenTree(nodes).find((n) => n.id === id);
}

/** Mục sâu nhất trên cây chứa câu hỏi (dựa vào ID câu), nếu có. */
export function nodeIdForQuestion(nodeMap: Map<string, TreeNode>, q: Pick<QuestionItem, "code">): string | null {
  const keys = questionAncestors(q.code);
  for (let i = keys.length - 1; i >= 0; i--) if (nodeMap.has(keys[i])) return keys[i];
  return null;
}

export interface ExportRow {
  id: string;
  title: string;
  cap: string;
}

/** Danh sách phẳng để xuất file mục lục (cột "cap" chỉ để dễ đọc). */
export function treeToFlatRows(roots: TreeNode[]): ExportRow[] {
  return flattenTree(roots)
    .filter((n) => n.kind && n.kind !== "unassigned" && n.id !== "all")
    .map((n) => ({ id: n.id, title: n.title, cap: KIND_LABEL[n.kind as NodeKind] || "" }));
}

export async function downloadTreeTemplateXlsx(rows: ExportRow[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["id", "title", "cap"] });
  ws["!cols"] = [{ wch: 25 }, { wch: 70 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "muc_luc");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}