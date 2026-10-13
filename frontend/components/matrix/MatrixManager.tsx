"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Dices,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  LayoutGrid,
  Library,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { useQuestionBank } from "@/lib/use-question-bank";
import { belongsTo, nodeIdForQuestion } from "@/lib/tree";
import { loadJson, saveJson } from "@/lib/storage";
import { downloadText } from "@/lib/download";
import { buildTex, exportMatrixJson, exportMatrixXlsx, importMatrixFile } from "@/lib/matrix-io";
import { Modal } from "@/components/question-bank/Modal";
import { LatexRenderer } from "@/components/question-bank/LatexRenderer";
import { QuestionBody } from "@/components/question-bank/QuestionBody";
import { QuestionDetailModal } from "@/components/question-bank/QuestionDetailModal";
import type { DifficultyLevel, QuestionItem } from "@/components/question-bank/types";
import { MatrixStats } from "./MatrixStats";
import { QuestionPickerModal } from "./QuestionPickerModal";
import { TopicPickerModal } from "./TopicPickerModal";
import {
  SLOT_TYPES,
  THPTQG,
  countRows,
  effectiveLevel,
  makeRows,
  newRowId,
  normType,
  rowLevel,
  syncRowLevel,
  topicLevel,
  type Counts,
  type MatrixRow,
  type SavedMatrix,
} from "./types";

const CURRENT_KEY = "qb.matrix.current.v1";
const KHO_KEY = "qb.matrix.kho.v1";

const GRID = "grid grid-cols-[48px_minmax(170px,1fr)_128px_96px_minmax(200px,1.1fr)_40px] gap-1.5 items-center";

type ModalKind = null | "custom" | "preview" | "save" | "kho-template" | "kho-open";

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function MatrixManager() {
  const bank = useQuestionBank();
  const { questions, questionMap, tree, nodeMap } = bank;

  const [rows, setRows] = useState<MatrixRow[]>(() => makeRows(THPTQG));
  const [restored, setRestored] = useState(false);
  const [mode, setMode] = useState<"manual" | "random">("manual");
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [topicRow, setTopicRow] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [fileMenu, setFileMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [kho, setKho] = useState<SavedMatrix[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // khôi phục ma trận đang soạn + kho
  useEffect(() => {
    let alive = true;
    // đọc localStorage sau khi mount (tránh lệch hydration) – đặt state trong callback bất đồng bộ
    queueMicrotask(() => {
      if (!alive) return;
      const cur = loadJson<MatrixRow[] | null>(CURRENT_KEY, null);
      if (cur && cur.length > 0) setRows(cur.map((r) => syncRowLevel({ ...r, id: newRowId() })));
      setKho(loadJson<SavedMatrix[]>(KHO_KEY, []));
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (restored) saveJson(CURRENT_KEY, rows);
  }, [rows, restored]);

  const sections = useMemo(
    () =>
      SLOT_TYPES.map((t) => ({
        type: t,
        items: rows.map((r, i) => ({ r, i })).filter(({ r }) => r.type === t),
      })).filter((s) => s.items.length > 0),
    [rows],
  );

  const usedByOthers = useCallback(
    (rowId: string) => new Set(rows.filter((r) => r.id !== rowId && r.questionId).map((r) => r.questionId as string)),
    [rows],
  );

  const candidatesFor = useCallback(
    (row: MatrixRow, exclude: Set<string>) =>
      questions.filter(
        (q) =>
          normType(q.type) === row.type &&
          !exclude.has(q.id) &&
          (!rowLevel(row) || q.level === rowLevel(row)) &&
          (!row.topicId || belongsTo(q, row.topicId)),
      ),
    [questions],
  );

  const patchRow = (id: string, patch: Partial<MatrixRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Gán câu vào dòng: nếu dòng chưa có dạng bài thì lấy dạng bài của câu; mức độ theo Dạng (nếu có)
  const withQuestion = (r: MatrixRow, q: QuestionItem): MatrixRow => {
    const topicId = r.topicId ?? nodeIdForQuestion(nodeMap, q);
    return { ...r, questionId: q.id, topicId, level: topicLevel(topicId) ?? r.level ?? q.level };
  };

  const assign = (rowId: string, q: QuestionItem) =>
    setRows((rs) => rs.map((r) => (r.id === rowId ? withQuestion(r, q) : r)));

  const rollRow = (row: MatrixRow) => {
    const c = candidatesFor(row, usedByOthers(row.id));
    const others = row.questionId ? c.filter((q) => q.id !== row.questionId) : c;
    if (others.length === 0) {
      notify("Không có câu phù hợp để rút ngẫu nhiên (kiểm tra dạng bài / mức độ của dòng này).");
      return;
    }
    assign(row.id, pick(others));
  };

  const fillRandom = () => {
    const used = new Set(rows.filter((r) => r.questionId).map((r) => r.questionId as string));
    let filled = 0;
    let missed = 0;
    const next = rows.map((r) => {
      if (r.questionId) return r;
      const c = candidatesFor(r, used);
      if (c.length === 0) {
        missed++;
        return r;
      }
      const q = pick(c);
      used.add(q.id);
      filled++;
      return withQuestion(r, q);
    });
    setRows(next);
    notify(
      filled === 0 && missed === 0
        ? "Tất cả các dòng đã có câu hỏi."
        : `Đã rút ngẫu nhiên ${filled} câu${missed ? ` · ${missed} dòng không có câu phù hợp` : ""}.`,
    );
  };

  const onLevelChange = (row: MatrixRow, v: string) => {
    if (topicLevel(row.topicId)) return; // mức độ do Dạng toán quy định, không chỉnh tay
    const level = v ? (Number(v) as DifficultyLevel) : null;
    const q = row.questionId ? questionMap.get(row.questionId) : undefined;

    // Bỏ chọn mức, hoặc câu hiện tại đã đúng mức mới → chỉ cập nhật mức, giữ nguyên câu
    if (!level || (q && q.level === level)) {
      patchRow(row.id, { level });
      return;
    }

    // Tự động rút ngẫu nhiên 1 câu theo mức mới (trong phạm vi dạng bài / mục đã chọn của dòng)
    const base: MatrixRow = { ...row, level, questionId: null };
    const candidates = candidatesFor(base, usedByOthers(row.id));
    if (candidates.length === 0) {
      patchRow(row.id, { level, questionId: null });
      notify(
        q
          ? `Đã bỏ câu cũ vì không khớp Mức ${level}, và chưa có câu phù hợp để rút ngẫu nhiên.`
          : `Chưa có câu phù hợp Mức ${level} (đúng kiểu / dạng bài / chưa dùng) để rút ngẫu nhiên.`,
      );
      return;
    }
    const chosen = pick(candidates);
    setRows((rs) => rs.map((r) => (r.id === row.id ? withQuestion(base, chosen) : r)));
    notify(`Đã tự chọn ngẫu nhiên câu ${chosen.code} theo Mức ${level} (trong ${candidates.length} câu phù hợp).`);
  };

  const onTopicPick = (rowId: string, topicId: string | null) => {
    setTopicRow(null);
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    // Chọn một Dạng → Mức độ tự điền theo Dạng đó (và bị khóa); chọn mục khác thì giữ mức hiện tại
    const level = topicLevel(topicId) ?? row.level ?? null;
    const q = row.questionId ? questionMap.get(row.questionId) : undefined;
    const keepQuestion = !q || !topicId || (belongsTo(q, topicId) && (!level || q.level === level));

    const base: MatrixRow = { ...row, topicId, level, questionId: keepQuestion ? row.questionId : null };

    // Bỏ chọn dạng bài → chỉ cập nhật dòng, không rút câu
    if (!topicId) {
      patchRow(rowId, { topicId, level, questionId: base.questionId });
      return;
    }

    // Dòng đã có câu và câu đó vẫn thuộc dạng mới → giữ nguyên
    if (base.questionId) {
      patchRow(rowId, { topicId, level });
      return;
    }

    // Tự động rút ngẫu nhiên 1 câu thuộc dạng vừa chọn (đúng kiểu, đúng mức, chưa dùng ở dòng khác)
    const candidates = candidatesFor(base, usedByOthers(rowId));
    if (candidates.length === 0) {
      patchRow(rowId, { topicId, level, questionId: null });
      notify(
        q
          ? "Đã bỏ câu cũ vì không thuộc dạng bài mới, và dạng này chưa có câu phù hợp để rút ngẫu nhiên."
          : "Dạng bài này chưa có câu phù hợp (đúng kiểu / mức độ / chưa dùng) để rút ngẫu nhiên.",
      );
      return;
    }
    const chosen = pick(candidates);
    setRows((rs) => rs.map((r) => (r.id === rowId ? withQuestion(base, chosen) : r)));
    notify(
      `Đã tự chọn ngẫu nhiên câu ${chosen.code}${candidates.length > 1 ? ` (trong ${candidates.length} câu phù hợp)` : ""}.`,
    );
  };

  // thống kê
  const stats = useMemo(() => {
    let low = 0;
    let high = 0;
    let sum = 0;
    rows.forEach((r) => {
      const lv = effectiveLevel(r, r.questionId ? questionMap.get(r.questionId) : undefined);
      if (!lv) return;
      sum += lv;
      if (lv <= 2) low++;
      else high++;
    });
    return { low, high, sum };
  }, [rows, questionMap]);

  const rowNumber = (row: MatrixRow) => rows.filter((r) => r.type === row.type).findIndex((r) => r.id === row.id) + 1;
  const filledList = useMemo(
    () => rows.map((r) => (r.questionId ? questionMap.get(r.questionId) : undefined)).filter((q): q is QuestionItem => !!q),
    [rows, questionMap],
  );

  // ===== hành động chân trang =====
  const reset = () => {
    if (rows.some((r) => r.questionId || r.topicId || r.level) && !window.confirm("Xóa toàn bộ lựa chọn và quay về cấu trúc THPT QG?")) return;
    setRows(makeRows(THPTQG));
    notify("Đã đặt lại ma trận.");
  };

  const saveToKho = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const item: SavedMatrix = { id: crypto.randomUUID(), name: clean, savedAt: new Date().toISOString(), rows };
    const next = [item, ...kho.filter((k) => k.name.toLowerCase() !== clean.toLowerCase())];
    setKho(next);
    saveJson(KHO_KEY, next);
    setModal(null);
    notify(`Đã lưu ma trận "${clean}" vào kho.`);
  };

  const removeFromKho = (id: string) => {
    const next = kho.filter((k) => k.id !== id);
    setKho(next);
    saveJson(KHO_KEY, next);
  };

  const loadFromKho = (m: SavedMatrix, withQuestions: boolean) => {
    const valid = new Set(questions.map((q) => q.id));
    setRows(
      m.rows.map((r) =>
        syncRowLevel({
          ...r,
          id: newRowId(),
          questionId: withQuestions && r.questionId && valid.has(r.questionId) ? r.questionId : null,
        }),
      ),
    );
    setModal(null);
    notify(withQuestions ? `Đã mở ma trận "${m.name}".` : `Đã tạo ma trận mới từ mẫu "${m.name}" (chưa chọn câu).`);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { rows: next, warnings } = await importMatrixFile(file, questionMap, questions, nodeMap);
      setRows(next.map(syncRowLevel));
      notify(`Đã nạp ${next.length} dòng từ "${file.name}"${warnings.length ? ` · ${warnings.length} cảnh báo: ${warnings[0]}` : ""}`);
    } catch (err) {
      notify(err instanceof Error ? `Lỗi: ${err.message}` : "Không đọc được file.");
    }
  };

  const exportTex = (solutions: boolean) => {
    setFileMenu(false);
    if (filledList.length === 0) {
      notify("Chưa có câu hỏi nào trong ma trận để xuất.");
      return;
    }
    const skipped = rows.length - filledList.length;
    downloadText(buildTex(filledList, { name: "Đề thi", solutions }), `de-thi-${Date.now()}.tex`);
    notify(`Đã xuất ${filledList.length} câu${skipped ? ` (bỏ qua ${skipped} dòng chưa có câu)` : ""}.`);
  };

  const pickerTarget = pickerRow ? rows.find((r) => r.id === pickerRow) : undefined;
  const topicTarget = topicRow ? rows.find((r) => r.id === topicRow) : undefined;
  const detailQ = detailId ? questionMap.get(detailId) : undefined;

  const btnTop = (active: boolean) =>
    `flex h-8 items-center gap-1.5 rounded px-3 text-[11px] font-bold tracking-wide transition ${
      active ? "bg-[#F2A60C] text-slate-900" : "border border-[#F2A60C]/70 bg-transparent text-[#F2A60C] hover:bg-[#F2A60C]/15"
    }`;
  const btnWhite = "flex h-8 items-center gap-1.5 rounded bg-white px-3 text-[11px] font-bold tracking-wide text-slate-800 transition hover:bg-gray-100";
  const btnFoot =
    "flex h-9 items-center gap-1.5 rounded border border-[#4A0E17] bg-white px-3 text-[11px] font-bold tracking-wide text-[#4A0E17] transition hover:bg-[#4A0E17]/5";

  return (
    <div className="font-ui-mono flex w-full flex-col gap-3 lg:flex-row lg:items-start">
      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex max-w-md items-start gap-2 rounded-lg bg-[#4A0E17] px-4 py-2.5 text-xs text-white shadow-xl sm:text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* ===== Cột trái: Quản lý ma trận đề ===== */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#4A0E17] bg-[#F3EFEE]">
        <header className="flex flex-wrap items-center justify-between gap-2 bg-[#4A0E17] px-4 py-3 text-white">
          <h1 className="flex items-center gap-2 text-sm font-bold">
            <LayoutGrid className="h-4 w-4" /> Quản lý ma trận đề
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={btnTop(mode === "manual")} onClick={() => setMode("manual")} title="Bấm nút ở cuối dòng để tự chọn câu hỏi">
              <CheckSquare className="h-3.5 w-3.5" /> TỰ CHỌN
            </button>
            <button
              type="button"
              className={btnTop(mode === "random")}
              onClick={() => {
                setMode("random");
                fillRandom();
              }}
              title="Rút ngẫu nhiên cho các dòng còn trống; sau đó nút cuối dòng sẽ đổi câu khác"
            >
              <Shuffle className="h-3.5 w-3.5" /> NGẪU NHIÊN
            </button>
            <span className="mx-1 hidden h-5 w-px bg-white/30 sm:block" />
            <button
              type="button"
              className="flex h-8 items-center rounded bg-[#F2A60C] px-3 text-[11px] font-bold text-slate-900 transition hover:brightness-95"
              onClick={() => {
                if (rows.some((r) => r.questionId) && !window.confirm("Đặt lại cấu trúc theo form THPT QG (12 TN + 4 Đ/S + 6 TLN)? Các câu đã chọn ở dòng bị bớt sẽ mất.")) return;
                setRows((rs) => makeRows(THPTQG, rs));
              }}
            >
              Form THPTQG
            </button>
            <button type="button" className={btnWhite} onClick={() => setModal("custom")}>
              Tùy chỉnh
            </button>
            <button
              type="button"
              className={btnWhite}
              onClick={() => {
                const first = rows.find((r) => !r.questionId);
                if (first) setPickerRow(first.id);
                else notify("Tất cả các dòng đã có câu hỏi.");
              }}
            >
              Chọn câu hỏi
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded bg-[#F2A60C]/50 px-3 text-[11px] font-bold tracking-wide text-white transition hover:bg-[#F2A60C]/70"
              onClick={() => setModal("preview")}
            >
              <Eye className="h-3.5 w-3.5" /> XEM TẤT CẢ
            </button>
          </div>
        </header>

        <div className="max-h-[calc(100vh-17rem)] min-h-[320px] overflow-auto px-3 py-3">
          <div className="min-w-[780px] space-y-3">
            <div className={`${GRID} sticky top-0 z-10 bg-[#F3EFEE] pb-1`}>
              {["Câu", "Tên dạng bài", "Kiểu", "Mức độ", "Dữ liệu"].map((h) => (
                <div key={h} className="rounded bg-[#4A0E17] py-2 text-center text-[11px] font-bold text-white">
                  {h}
                </div>
              ))}
              <span />
            </div>

            {rows.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-500">
                Ma trận chưa có dòng nào. Bấm <strong>Form THPTQG</strong> hoặc <strong>Tùy chỉnh</strong> để tạo cấu trúc đề.
              </p>
            )}

            {sections.map((sec) => (
              <div key={sec.type} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-[#F2A60C] px-3 py-1 text-[11px] font-bold text-slate-900">{sec.type}</span>
                  <span className="text-[11px] text-gray-500">{sec.items.length} câu</span>
                </div>

                {sec.items.map(({ r }, k) => {
                  const q = r.questionId ? questionMap.get(r.questionId) : undefined;
                  const topic = r.topicId ? nodeMap.get(r.topicId) : undefined;
                  const lockedLevel = topicLevel(r.topicId); // mức độ do Dạng toán quy định
                  const avail =
                    !q && (r.topicId || rowLevel(r)) ? candidatesFor(r, usedByOthers(r.id)).length : null;
                  return (
                    <div key={r.id} className={GRID}>
                      <div className="rounded bg-white py-2 text-center text-xs font-bold text-slate-800">{k + 1}</div>

                      <button
                        type="button"
                        onClick={() => setTopicRow(r.id)}
                        title={topic ? `${topic.title}\n(${topic.id})` : "Chọn dạng bài trên cây mục lục"}
                        className="flex h-9 items-center gap-2 rounded bg-[#E4E1E0] px-3 text-left text-xs text-slate-700 transition hover:bg-[#d9d5d4]"
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className={`truncate ${topic ? "font-semibold" : ""}`}>{topic ? topic.title : "Tên dạng bài"}</span>
                      </button>

                      <div className="flex h-9 items-center justify-center rounded bg-[#F2A60C] text-[11px] font-bold text-slate-900">
                        {r.type}
                      </div>

                      <div className="relative">
                        <select
                          value={lockedLevel ?? r.level ?? ""}
                          disabled={lockedLevel !== null}
                          onChange={(e) => onLevelChange(r, e.target.value)}
                          aria-label={`Mức độ câu ${k + 1} ${r.type}`}
                          title={lockedLevel !== null ? "Mức độ do Dạng toán đã chọn quy định – bỏ chọn dạng bài để đổi" : undefined}
                          className="h-9 w-full rounded bg-[#F2A60C] px-2 text-[11px] font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#4A0E17]/40 disabled:cursor-not-allowed disabled:opacity-100"
                        >
                          <option value="">Mức?</option>
                          {[1, 2, 3, 4].map((l) => (
                            <option key={l} value={l}>
                              Mức {l}
                            </option>
                          ))}
                        </select>
                        {lockedLevel !== null && (
                          <Lock className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-800/70" />
                        )}
                      </div>

                      {q ? (
                        <div className="flex h-9 items-center gap-1 rounded border border-gray-300 bg-white px-2">
                          <button
                            type="button"
                            onClick={() => setDetailId(q.id)}
                            title="Xem đầy đủ câu hỏi"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="shrink-0 text-[10.5px] font-bold text-[#4A0E17]">{q.code}</span>
                            <LatexRenderer content={q.content} className="line-clamp-1 min-w-0 !text-[11.5px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => patchRow(r.id, { questionId: null })}
                            title="Bỏ câu này"
                            aria-label="Bỏ câu này"
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (mode === "manual" ? setPickerRow(r.id) : rollRow(r))}
                          className="flex h-9 items-center justify-between rounded border border-dashed border-gray-300 bg-[#FAFAFA] px-3 text-left text-[11px] text-gray-400 hover:border-[#4A0E17]/50"
                        >
                          <span>Chưa có câu</span>
                          {avail !== null && <span className="text-[10px]">{avail} câu phù hợp</span>}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => (mode === "manual" ? setPickerRow(r.id) : rollRow(r))}
                        title={mode === "manual" ? "Chọn câu hỏi cho dòng này" : "Rút ngẫu nhiên câu khác"}
                        aria-label={mode === "manual" ? "Chọn câu hỏi" : "Rút ngẫu nhiên"}
                        className="flex h-9 w-9 items-center justify-center rounded bg-[#4A0E17] text-white transition hover:bg-[#5d1420]"
                      >
                        {mode === "manual" ? <CheckSquare className="h-4 w-4" /> : <Dices className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-1.5 border-t border-gray-300 bg-[#F3EFEE] px-3 py-3">
          <button type="button" className={btnFoot} onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" /> RESET
          </button>
          <button type="button" className={btnFoot} onClick={() => importRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> TẠO MA TRẬN TỪ FILE
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onImportFile} />
          <button type="button" className={btnFoot} onClick={() => setModal("kho-template")}>
            <Library className="h-3.5 w-3.5" /> TẠO MA TRẬN TỪ KHO
          </button>
          <button type="button" className={btnFoot} onClick={() => setModal("save")}>
            <Save className="h-3.5 w-3.5" /> LƯU MA TRẬN VÀO KHO
          </button>
          <button type="button" className={btnFoot} onClick={() => setModal("kho-open")}>
            KHO CỦA TÔI
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              className={btnFoot}
              onClick={() => exportMatrixXlsx({ rows, qById: questionMap, nodeMap }, "ma-tran-de")}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> XUẤT EXCEL
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFileMenu((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded bg-[#4A0E17] px-3.5 text-[11px] font-bold tracking-wide text-white transition hover:bg-[#5d1420]"
              >
                <FileDown className="h-3.5 w-3.5" /> XUẤT FILE <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {fileMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setFileMenu(false)} />
                  <div className="absolute bottom-full right-0 z-30 mb-1 w-60 rounded-md border border-gray-200 bg-white py-1 text-xs text-gray-700 shadow-lg">
                    <button type="button" className="w-full px-3 py-2 text-left hover:bg-gray-100" onClick={() => exportTex(false)}>
                      LaTeX (.tex) – đề, không lời giải
                    </button>
                    <button type="button" className="w-full px-3 py-2 text-left hover:bg-gray-100" onClick={() => exportTex(true)}>
                      LaTeX (.tex) – kèm lời giải
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-100"
                      onClick={() => {
                        setFileMenu(false);
                        exportMatrixJson(rows, "ma-tran-de");
                      }}
                    >
                      Ma trận (.json)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </footer>
      </section>

      {/* ===== Cột phải: Thống kê ===== */}
      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[330px]">
        <MatrixStats total={rows.length} low={stats.low} high={stats.high} levelSum={stats.sum} />
      </aside>

      {/* ===== Các hộp thoại ===== */}
      {pickerTarget && (
        <QuestionPickerModal
          row={pickerTarget}
          rowNumber={rowNumber(pickerTarget)}
          questions={questions}
          nodeMap={nodeMap}
          usedByOthers={usedByOthers(pickerTarget.id)}
          onPick={(q) => {
            assign(pickerTarget.id, q);
            setPickerRow(null);
          }}
          onClose={() => setPickerRow(null)}
        />
      )}

      {topicTarget && (
        <TopicPickerModal
          tree={tree}
          currentId={topicTarget.topicId}
          onPick={(id) => onTopicPick(topicTarget.id, id)}
          onClose={() => setTopicRow(null)}
        />
      )}

      {detailQ && <QuestionDetailModal question={detailQ} onClose={() => setDetailId(null)} />}

      {modal === "custom" && (
        <CustomizeModal
          initial={countRows(rows)}
          onApply={(c) => {
            setRows((rs) => makeRows(c, rs));
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "preview" && (
        <PreviewModal rows={rows} questionMap={questionMap} onClose={() => setModal(null)} />
      )}

      {modal === "save" && <SaveModal kho={kho} onSave={saveToKho} onClose={() => setModal(null)} />}

      {(modal === "kho-template" || modal === "kho-open") && (
        <KhoModal
          kho={kho}
          templateMode={modal === "kho-template"}
          onUse={(m) => loadFromKho(m, modal === "kho-open")}
          onDelete={removeFromKho}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ---------- Hộp thoại phụ ---------- */

function CustomizeModal({ initial, onApply, onClose }: { initial: Counts; onApply: (c: Counts) => void; onClose: () => void }) {
  const [c, setC] = useState<Counts>(initial);
  const total = SLOT_TYPES.reduce((s, t) => s + c[t], 0);
  return (
    <Modal
      title="Tùy chỉnh cấu trúc đề"
      widthClass="max-w-md"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Tổng: {total} câu</span>
          <button
            type="button"
            onClick={() => onApply(c)}
            className="rounded bg-[#4A0E17] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5d1420]"
          >
            ÁP DỤNG
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {SLOT_TYPES.map((t) => (
          <label key={t} className="flex items-center justify-between gap-3">
            <span className="font-semibold text-gray-700">{t}</span>
            <input
              type="number"
              min={0}
              max={60}
              value={c[t]}
              onChange={(e) => setC({ ...c, [t]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
              className="h-8 w-24 rounded border border-gray-300 px-2 text-right focus:border-[#4A0E17] focus:outline-hidden"
            />
          </label>
        ))}
        <p className="text-xs text-gray-500">Các dòng đã chọn được giữ lại theo thứ tự; dòng thừa sẽ bị bỏ.</p>
      </div>
    </Modal>
  );
}

function PreviewModal({
  rows,
  questionMap,
  onClose,
}: {
  rows: MatrixRow[];
  questionMap: Map<string, QuestionItem>;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState(false);
  let n = 0;
  return (
    <Modal
      title="Xem trước toàn bộ đề"
      widthClass="max-w-4xl"
      onClose={onClose}
      headerExtra={
        <label className="flex items-center gap-1.5 text-xs font-normal">
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> Hiện đáp án & lời giải
        </label>
      }
    >
      <div className="space-y-5">
        {SLOT_TYPES.map((t) => {
          const items = rows.filter((r) => r.type === t);
          if (!items.length) return null;
          return (
            <div key={t}>
              <div className="mb-2 inline-block rounded bg-[#F2A60C] px-3 py-1 text-xs font-bold text-slate-900">{t}</div>
              <div className="space-y-4">
                {items.map((r) => {
                  n++;
                  const q = r.questionId ? questionMap.get(r.questionId) : undefined;
                  return (
                    <div key={r.id} className="rounded-md border border-gray-200 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <strong className="text-[#4A0E17]">Câu {n}</strong>
                        <span className="text-gray-400">{q ? q.code : "chưa chọn câu"}</span>
                      </div>
                      {q ? (
                        <QuestionBody question={q} showAnswer={answers} showSolution={answers} />
                      ) : (
                        <p className="text-xs italic text-gray-400">(Dòng này chưa có câu hỏi)</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-gray-500">Ma trận chưa có dòng nào.</p>}
      </div>
    </Modal>
  );
}

function SaveModal({ kho, onSave, onClose }: { kho: SavedMatrix[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const exists = kho.some((k) => k.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Modal
      title="Lưu ma trận vào kho"
      widthClass="max-w-md"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave(name)}
            className="rounded bg-[#4A0E17] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5d1420] disabled:opacity-40"
          >
            LƯU
          </button>
        </div>
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block font-semibold text-gray-700">Tên ma trận</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name)}
          placeholder="VD: Kiểm tra giữa kì 1 – Toán 12"
          className="h-9 w-full rounded border border-gray-300 px-3 focus:border-[#4A0E17] focus:outline-hidden"
        />
      </label>
      {exists && <p className="mt-2 text-xs text-amber-700">Đã có ma trận trùng tên – lưu sẽ ghi đè.</p>}
      <p className="mt-2 text-xs text-gray-500">Kho được lưu trên trình duyệt này (localStorage).</p>
    </Modal>
  );
}

function KhoModal({
  kho,
  templateMode,
  onUse,
  onDelete,
  onClose,
}: {
  kho: SavedMatrix[];
  templateMode: boolean;
  onUse: (m: SavedMatrix) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={templateMode ? "Tạo ma trận từ kho (chỉ lấy cấu trúc)" : "Kho của tôi"} widthClass="max-w-xl" onClose={onClose}>
      {kho.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          Kho còn trống. Bấm <strong>LƯU MA TRẬN VÀO KHO</strong> để lưu ma trận hiện tại.
        </p>
      ) : (
        <ul className="space-y-2">
          {kho.map((m) => {
            const filled = m.rows.filter((r) => r.questionId).length;
            return (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{m.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {m.rows.length} dòng · {filled} câu đã chọn · {new Date(m.savedAt).toLocaleString("vi-VN")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onUse(m)}
                    className="flex items-center gap-1 rounded bg-[#4A0E17] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#5d1420]"
                  >
                    <Plus className="h-3 w-3" /> {templateMode ? "DÙNG LÀM MẪU" : "MỞ"}
                  </button>
                  {!templateMode && (
                    <button
                      type="button"
                      onClick={() => window.confirm(`Xóa "${m.name}" khỏi kho?`) && onDelete(m.id)}
                      title="Xóa khỏi kho"
                      aria-label="Xóa khỏi kho"
                      className="rounded p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}