"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LEVELS, api, post, put, type Question } from "@/lib/api";
import { mapBackendQuestion } from "@/lib/question-mapper";
import { loadJson, removeKey, saveJson } from "@/lib/storage";
import {
  buildTree,
  flattenTree,
  parseTreeFile,
  parseTreeJson,
  parseTreeXlsxBuffer,
  rowsFromObjects,
  withCounts,
  type FlatRow,
} from "@/lib/tree";
import { formatParts, isAssignable, nodeKey, parseQid, readQidFromRaw, type TypeAbbr } from "@/lib/qid";
import { parseExercise } from "@/lib/exam-parser";
import { MOCK_QUESTIONS } from "@/components/question-bank/mock-data";
import type { DupMap, DupMatch, QuestionItem, QuestionType, TreeNode } from "@/components/question-bank/types";

/** Kết quả duyệt: `skipped` = các câu bị bỏ qua vì nghi trùng (xem lại rồi quyết định). */
export interface ApproveResult {
  approved: number;
  skipped: { id: string; matches: DupMatch[] }[];
}
import sampleTree from "@/data/muc-luc.sample.json";

const TREE_KEY = "qb.tree.v2";
const MODE_KEY = "qb.treeMode.v2";
/**
 * File mục lục tự động nạp từ frontend/public/, theo thứ tự ưu tiên:
 * muc-luc.xlsx (Excel) -> muc-luc.json. File nào không có hoặc không hợp lệ thì thử file kế tiếp.
 */
export const AUTO_TREE_SOURCES = [
  { url: "/muc-luc.xlsx", label: "public/muc-luc.xlsx", kind: "xlsx" },
  { url: "/muc-luc.json", label: "public/muc-luc.json", kind: "json" },
] as const;
export const AUTO_TREE_LABEL = "public/muc-luc.xlsx hoặc muc-luc.json";
const PAGE = 1000;
const MAX_QUESTIONS = 30000;

export type TreeMode = "auto" | "manual";

interface StoredTree {
  rows: FlatRow[];
  source: string;
}

const DEFAULT_ROWS = rowsFromObjects(sampleTree as Record<string, unknown>[]).rows;

async function fetchAllQuestions(): Promise<QuestionItem[]> {
  const out: QuestionItem[] = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total && skip < MAX_QUESTIONS) {
    const res = await api<{ total: number; data: Question[] }>(`/api/questions/?skip=${skip}&limit=${PAGE}`);
    total = res.total;
    if (!res.data.length) break;
    res.data.forEach((q, i) => out.push(mapBackendQuestion(q, skip + i)));
    skip += res.data.length;
  }
  return out;
}

/** Câu hỏi chờ kiểm duyệt (mới nhập từ file .tex, chưa vào ngân hàng). */
async function fetchAllPending(): Promise<QuestionItem[]> {
  const out: QuestionItem[] = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total && skip < MAX_QUESTIONS) {
    const res = await api<{ total: number; data: Question[] }>(`/api/questions/pending?skip=${skip}&limit=${PAGE}`);
    total = res.total;
    if (!res.data.length) break;
    res.data.forEach((q, i) => out.push(mapBackendQuestion(q, skip + i)));
    skip += res.data.length;
  }
  return out;
}

/** Kiểm tra trùng nội dung của các câu đang chờ duyệt: { id_câu: [các câu nghi trùng] } */
async function fetchDuplicates(): Promise<DupMap> {
  const res = await api<{ duplicates: DupMap }>("/api/questions/pending/duplicates");
  return res.duplicates ?? {};
}

const TYPE_FROM_KIND = {
  choice: "Trắc nghiệm",
  tf: "Đúng/Sai",
  short: "Trả lời ngắn",
  essay: "Tự luận",
} as const satisfies Record<string, QuestionType>;

const ABBR_FROM_KIND = { choice: "TN", tf: "DS", short: "TLN", essay: "TL" } as const satisfies Record<string, TypeAbbr>;

/** Thay đổi người dùng thực hiện trên một câu hỏi. */
export interface QuestionPatch {
  /** Mã LaTeX \begin{ex}…\end{ex} mới */
  raw?: string;
  /** ID mới, dạng T0.TN.C1.B3.01 */
  code?: string;
}

export function useQuestionBank() {
  const [questions, setQuestions] = useState<QuestionItem[]>(MOCK_QUESTIONS);
  const [pending, setPending] = useState<QuestionItem[]>([]);
  const [duplicates, setDuplicates] = useState<DupMap>({});
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Cây mục lục: tự động (đọc /muc-luc.xlsx hoặc /muc-luc.json) hoặc thủ công (file người dùng nạp) ----
  const [mode, setModeState] = useState<TreeMode>("auto");
  const [autoTree, setAutoTree] = useState<StoredTree & { warnings: string[] }>({
    rows: DEFAULT_ROWS,
    source: "Mẫu tích hợp sẵn",
    warnings: [],
  });
  const [manualTree, setManualTree] = useState<(StoredTree & { warnings: string[] }) | null>(null);

  const loadAutoTree = useCallback(async (): Promise<{ count: number; source: string }> => {
    for (const src of AUTO_TREE_SOURCES) {
      try {
        const res = await fetch(src.url, { cache: "no-store" });
        if (!res.ok) continue; // không có file này -> thử file kế tiếp
        let parsed;
        if (src.kind === "xlsx") {
          const buf = await res.arrayBuffer();
          const head = new Uint8Array(buf.slice(0, 2));
          // .xlsx thực chất là file zip (bắt đầu bằng "PK"); tránh trường hợp server trả về trang HTML thay cho file
          if (head[0] !== 0x50 || head[1] !== 0x4b) continue;
          parsed = await parseTreeXlsxBuffer(buf);
        } else {
          parsed = parseTreeJson(await res.json());
        }
        if (parsed.rows.length === 0) continue;
        setAutoTree({ rows: parsed.rows, source: src.label, warnings: parsed.warnings });
        return { count: parsed.rows.length, source: src.label };
      } catch {
        // file lỗi định dạng -> thử file kế tiếp
      }
    }
    setAutoTree({
      rows: DEFAULT_ROWS,
      source: `Mẫu tích hợp sẵn (không đọc được ${AUTO_TREE_LABEL})`,
      warnings: [],
    });
    return { count: DEFAULT_ROWS.length, source: "mẫu tích hợp sẵn" };
  }, []);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      const storedMode = loadJson<TreeMode>(MODE_KEY, "auto");
      const stored = loadJson<StoredTree | null>(TREE_KEY, null);
      if (stored?.rows?.length) setManualTree({ ...stored, warnings: [] });
      if (storedMode === "manual" && stored?.rows?.length) setModeState("manual");
      loadAutoTree();
    });
    return () => {
      alive = false;
    };
  }, [loadAutoTree]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchAllQuestions();
        if (!alive) return;
        // Gọi API thành công => dùng dữ liệu thật, kể cả khi ngân hàng đang trống
        setQuestions(list);
        setSource("api");
        setLoadError(null);
        try {
          const waiting = await fetchAllPending();
          if (alive) setPending(waiting);
          const dups = waiting.length > 0 ? await fetchDuplicates().catch(() => ({}) as DupMap) : {};
          if (alive) setDuplicates(dups);
        } catch {
          // backend cũ chưa có API chờ kiểm duyệt -> coi như không có câu nào chờ
        }
      } catch (e) {
        // Backend lỗi/không kết nối được -> giữ dữ liệu mẫu nhưng báo rõ lý do
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Tải lại cả ngân hàng lẫn danh sách chờ kiểm duyệt (sau khi nhập đề hoặc duyệt câu). */
  const reloadQuestions = useCallback(async () => {
    const [list, waiting, dups] = await Promise.all([
      fetchAllQuestions(),
      fetchAllPending().catch(() => [] as QuestionItem[]),
      fetchDuplicates().catch(() => ({}) as DupMap),
    ]);
    setQuestions(list);
    setPending(waiting);
    setDuplicates(waiting.length > 0 ? dups : {});
    setSource("api");
    setLoadError(null);
    return { bank: list.length, pending: waiting.length };
  }, []);

  /** Chỉ tính lại kết quả kiểm tra trùng (sau khi sửa nội dung / đổi ID / từ chối câu chờ duyệt). */
  const refreshDuplicates = useCallback(async () => {
    try {
      setDuplicates(await fetchDuplicates());
    } catch {
      /* giữ kết quả cũ nếu lỗi mạng */
    }
  }, []);

  /**
   * Duyệt các câu: chuyển từ "chờ kiểm duyệt" vào ngân hàng chính thức.
   * Backend kiểm tra trùng LẠI lúc duyệt: câu nghi trùng bị bỏ qua (trả về trong `skipped`) trừ khi force = true.
   */
  const approvePending = useCallback(
    async (ids: string[], force = false): Promise<ApproveResult> => {
      if (ids.length === 0) return { approved: 0, skipped: [] };
      const res = await post<{ approved: number; skipped?: ApproveResult["skipped"] }>("/api/questions/pending/approve", {
        ids,
        force,
      });
      await reloadQuestions();
      return { approved: res.approved, skipped: res.skipped ?? [] };
    },
    [reloadQuestions],
  );

  /** "Giữ cả hai": xác nhận câu chờ duyệt này KHÔNG trùng các câu đang bị cảnh báo. */
  const dismissDuplicates = useCallback(
    async (id: string, otherIds: string[] = []) => {
      await post(`/api/questions/pending/${id}/dismiss-duplicates`, { other_ids: otherIds });
      await refreshDuplicates();
    },
    [refreshDuplicates],
  );

  /** Thay thế câu cũ trong ngân hàng bằng câu mới (câu cũ vào Thùng rác, vẫn phục hồi được). */
  const replaceWithPending = useCallback(
    async (id: string, oldId: string) => {
      await post(`/api/questions/pending/${id}/replace`, { old_id: oldId });
      await reloadQuestions();
    },
    [reloadQuestions],
  );

  /** Từ chối các câu chờ duyệt: chuyển vào Thùng rác (vẫn phục hồi được). */
  const rejectPending = useCallback(async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;
    const res = await post<{ rejected: number }>("/api/questions/pending/reject", { ids });
    const gone = new Set(ids);
    setPending((list) => list.filter((q) => !gone.has(q.id)));
    void refreshDuplicates();
    return res.rejected;
  }, [refreshDuplicates]);

  const activeTree = mode === "manual" && manualTree ? manualTree : autoTree;

  const tree: TreeNode[] = useMemo(
    () =>
      withCounts(
        buildTree(
          activeTree.rows,
          questions.map((q) => q.code),
        ),
        questions,
        pending.length,
      ),
    [activeTree, questions, pending.length],
  );
  const nodeMap = useMemo(() => new Map(flattenTree(tree).map((n) => [n.id, n])), [tree]);
  // gồm cả câu chờ kiểm duyệt để xem / sửa / gắn ID ngay trong mục kiểm duyệt
  const questionMap = useMemo(() => new Map([...questions, ...pending].map((q) => [q.id, q])), [questions, pending]);

  /** Chuyển chế độ. Sang "thủ công" mà chưa có file nào đã nạp thì trả về false (giao diện sẽ mở hộp chọn file). */
  const setTreeMode = useCallback(
    (next: TreeMode): boolean => {
      if (next === "manual" && !manualTree) return false;
      setModeState(next);
      saveJson(MODE_KEY, next);
      return true;
    },
    [manualTree],
  );

  /** Nạp cây từ file .json / .xlsx (chế độ thủ công). Ném lỗi nếu file không hợp lệ. */
  const loadTreeFile = useCallback(async (file: File) => {
    const { rows, warnings } = await parseTreeFile(file);
    if (rows.length === 0) throw new Error("File không có mục nào hợp lệ.");
    setManualTree({ rows, source: file.name, warnings });
    setModeState("manual");
    saveJson(TREE_KEY, { rows, source: file.name } satisfies StoredTree);
    saveJson(MODE_KEY, "manual");
    return { count: rows.length, warnings };
  }, []);

  /** Đọc lại cây tự động (sau khi sửa public/muc-luc.xlsx hoặc muc-luc.json) và chuyển về chế độ tự động. */
  const reloadAutoTree = useCallback(async () => {
    const r = await loadAutoTree();
    setModeState("auto");
    saveJson(MODE_KEY, "auto");
    return r;
  }, [loadAutoTree]);

  /** Xóa file thủ công đã nạp và quay về chế độ tự động. */
  const resetTree = useCallback(() => {
    setManualTree(null);
    setModeState("auto");
    removeKey(TREE_KEY);
    saveJson(MODE_KEY, "auto");
  }, []);

  // ---- Sửa / gắn ID / xóa câu hỏi ----

  /** Các trường phân loại (lớp, chương, bài, dạng) gửi kèm khi gắn ID, lấy tên từ cây mục lục. */
  const classificationFor = useCallback(
    (code: string) => {
      const p = parseQid(code);
      if (!p || !isAssignable(p)) return {};
      const title = (kind: "chapter" | "lesson" | "form") => {
        const key = nodeKey(p.parts, kind);
        return key ? (nodeMap.get(key)?.title ?? null) : null;
      };
      return {
        grade_level: String(10 + Number((p.parts.grade ?? "T0").replace(/\D/g, ""))),
        chapter: title("chapter"),
        lesson: title("lesson"),
        topic: title("form"),
      };
    },
    [nodeMap],
  );

  const updateQuestion = useCallback(
    async (id: string, patch: QuestionPatch): Promise<QuestionItem> => {
      const q = questionMap.get(id);
      if (!q) throw new Error("Không tìm thấy câu hỏi.");

      let nextCode = patch.code?.trim();
      const body: Record<string, unknown> = {};
      let kind: keyof typeof TYPE_FROM_KIND | null = null;

      if (patch.raw !== undefined) {
        if (!/\\begin\{ex\}[\s\S]*\\end\{ex\}/.test(patch.raw)) {
          throw new Error("Nội dung phải nằm trong \\begin{ex} … \\end{ex}.");
        }
        body.content_latex = patch.raw;
        kind = parseExercise(patch.raw).kind;
        // loại câu đổi → đoạn loại trong ID phải đổi theo (TN/DS/TLN/TL)
        // ID sửa trực tiếp ở dòng \begin{ex}%[ID] trong mã LaTeX cũng được nhận
        if (!nextCode) {
          const rawId = readQidFromRaw(patch.raw);
          const p = parseQid(rawId ?? q.code);
          if (p && isAssignable(p) && p.parts.type !== ABBR_FROM_KIND[kind]) {
            nextCode = formatParts({ ...p.parts, type: ABBR_FROM_KIND[kind] });
          } else if (rawId && rawId !== q.code) {
            nextCode = rawId;
          }
        }
      }
      if (nextCode !== undefined && nextCode !== q.code) {
        const p = parseQid(nextCode);
        if (!isAssignable(p)) throw new Error("ID chưa hợp lệ: cần tối thiểu Lớp, Loại, Chương, Bài (VD T0.TN.C1.B3).");
        body.question_code = formatParts(p.parts);
        Object.assign(body, classificationFor(nextCode));
        // mã cũ có thể đang mang mức độ trong hậu tố → ghi mức độ vào cột riêng để không mất
        if (q.level) body.difficulty_level = LEVELS[q.level - 1];
        nextCode = body.question_code as string;
      } else {
        nextCode = undefined;
      }
      if (Object.keys(body).length === 0) return q;

      let updated: QuestionItem;
      if (source === "api") {
        const res = await put<Question>(`/api/questions/${id}`, body);
        updated = { ...mapBackendQuestion(res, q.number - 1), number: q.number };
      } else {
        updated = { ...q };
        if (patch.raw !== undefined && kind) {
          updated.raw = patch.raw;
          updated.content = parseExercise(patch.raw).stem;
          updated.type = TYPE_FROM_KIND[kind];
          const parsed = parseExercise(patch.raw);
          updated.solution = parsed.solution ?? undefined;
          updated.answer = parsed.answer ?? undefined;
        }
        if (nextCode) updated.code = nextCode;
      }
      setQuestions((list) => list.map((x) => (x.id === id ? updated : x)));
      setPending((list) => list.map((x) => (x.id === id ? updated : x)));
      // đổi nội dung / ID có thể làm thay đổi kết quả kiểm tra trùng
      if (pending.length > 0) void refreshDuplicates();
      return updated;
    },
    [questionMap, source, classificationFor, pending.length, refreshDuplicates],
  );

  /* const deleteQuestion = useCallback(
    async (id: string): Promise<void> => {
      if (source === "api") await api(`/api/questions/${id}`, { method: "DELETE" });
      setQuestions((list) => list.filter((x) => x.id !== id));
    },
    [source],
  ); */

  const deleteQuestion = useCallback(
  async (id: string): Promise<void> => {
    if (source !== "api") throw new Error("Chưa kết nối backend nên không thể xóa thật.");
    await api(`/api/questions/${id}`, { method: "DELETE" });
    setQuestions((list) => list.filter((x) => x.id !== id));
    setPending((list) => list.filter((x) => x.id !== id));
    if (pending.length > 0) void refreshDuplicates();
  },
  [source, pending.length, refreshDuplicates],
);

  return {
    questions,
    pending,
    duplicates,
    questionMap,
    source,
    loadError,
    loading,
    tree,
    nodeMap,
    treeMode: mode,
    treeSource: activeTree.source,
    treeWarnings: activeTree.warnings,
    hasManualTree: manualTree !== null,
    setTreeMode,
    loadTreeFile,
    reloadAutoTree,
    resetTree,
    updateQuestion,
    deleteQuestion,
    reloadQuestions,
    approvePending,
    rejectPending,
    refreshDuplicates,
    dismissDuplicates,
    replaceWithPending,
  };
}
