"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LEVELS, api, put, type Question } from "@/lib/api";
import { mapBackendQuestion } from "@/lib/question-mapper";
import { loadJson, removeKey, saveJson } from "@/lib/storage";
import {
  buildTree,
  flattenTree,
  parseTreeFile,
  parseTreeJson,
  rowsFromObjects,
  withCounts,
  type FlatRow,
} from "@/lib/tree";
import { formatParts, gradeOf, isAssignable, nodeKey, parseQid, type TypeAbbr } from "@/lib/qid";
import { parseExercise } from "@/lib/exam-parser";
import { MOCK_QUESTIONS } from "@/components/question-bank/mock-data";
import type { QuestionItem, QuestionType, TreeNode } from "@/components/question-bank/types";
import sampleTree from "@/data/muc-luc.sample.json";

const TREE_KEY = "qb.tree.v2";
const MODE_KEY = "qb.treeMode.v2";
/** File mục lục tự động nạp: frontend/public/muc-luc.json */
export const AUTO_TREE_URL = "/muc-luc.json";
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
  const [source, setSource] = useState<"mock" | "api">("mock");
  const [loading, setLoading] = useState(true);

  // ---- Cây mục lục: tự động (đọc /muc-luc.json) hoặc thủ công (file người dùng nạp) ----
  const [mode, setModeState] = useState<TreeMode>("auto");
  const [autoTree, setAutoTree] = useState<StoredTree & { warnings: string[] }>({
    rows: DEFAULT_ROWS,
    source: "Mẫu tích hợp sẵn",
    warnings: [],
  });
  const [manualTree, setManualTree] = useState<(StoredTree & { warnings: string[] }) | null>(null);

  const loadAutoTree = useCallback(async (): Promise<{ count: number; source: string }> => {
    try {
      const res = await fetch(AUTO_TREE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { rows, warnings } = parseTreeJson(await res.json());
      if (rows.length === 0) throw new Error("File không có mục nào hợp lệ.");
      setAutoTree({ rows, source: "public/muc-luc.json", warnings });
      return { count: rows.length, source: "public/muc-luc.json" };
    } catch {
      setAutoTree({
        rows: DEFAULT_ROWS,
        source: "Mẫu tích hợp sẵn (không đọc được public/muc-luc.json)",
        warnings: [],
      });
      return { count: DEFAULT_ROWS.length, source: "mẫu tích hợp sẵn" };
    }
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
    fetchAllQuestions()
      .then((list) => {
        if (!alive) return;
        if (list.length > 0) {
          setQuestions(list);
          setSource("api");
        }
      })
      .catch(() => {
        /* backend chưa chạy → dùng dữ liệu mẫu */
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const activeTree = mode === "manual" && manualTree ? manualTree : autoTree;

  const tree: TreeNode[] = useMemo(
    () =>
      withCounts(
        buildTree(
          activeTree.rows,
          questions.map((q) => q.code),
        ),
        questions,
      ),
    [activeTree, questions],
  );
  const nodeMap = useMemo(() => new Map(flattenTree(tree).map((n) => [n.id, n])), [tree]);
  const questionMap = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

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

  /** Đọc lại cây tự động (sau khi sửa public/muc-luc.json) và chuyển về chế độ tự động. */
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
        grade_level: String(gradeOf(p.parts)),
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
        if (!nextCode) {
          const p = parseQid(q.code);
          if (p && isAssignable(p) && p.parts.type !== ABBR_FROM_KIND[kind]) {
            nextCode = formatParts({ ...p.parts, type: ABBR_FROM_KIND[kind] });
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
      return updated;
    },
    [questionMap, source, classificationFor],
  );

  const deleteQuestion = useCallback(
    async (id: string): Promise<void> => {
      if (source === "api") await api(`/api/questions/${id}`, { method: "DELETE" });
      setQuestions((list) => list.filter((x) => x.id !== id));
    },
    [source],
  );

  return {
    questions,
    questionMap,
    source,
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
  };
}
