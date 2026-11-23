"use client";

import React, { useState } from "react";
import { CheckCircle2, FileDown, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { API } from "@/lib/api";
import { downloadBlob } from "@/lib/download";

type Mode = "exam" | "answers" | "solutions";
type DocType = "exercise" | "exam";

interface ExamHeaderState {
  department: string;
  school: string;
  examName: string;
  schoolYear: string;
  subject: string;
  grade: string;
  duration: string;
  examCode: string;
}

interface Props {
  /** Id các câu hỏi cần xuất, theo đúng thứ tự muốn in */
  ids: string[];
  /** Tiêu đề mặc định in ở đầu file PDF */
  defaultTitle?: string;
  /** Cho phép sinh nhiều đề (dùng ở trang Ma trận & Sinh đề) */
  allowMultiExam?: boolean;
  /** Kiểu tài liệu mặc định ("exercise" = Bài tập, "exam" = Bài kiểm tra) */
  defaultDocType?: DocType;
  onClose: () => void;
}

const MAX_QUESTIONS = 300;
const MAX_EXAMS = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "exam", label: "Chỉ in đề (dethi)", hint: "Chỉ hiển thị đề và các phương án, dùng để in phát cho học sinh." },
  { id: "answers", label: "Đề + Đáp án (color)", hint: "Tô ô vàng viền đỏ và chữ đỏ cho đáp án đúng, không in lời giải." },
  { id: "solutions", label: "Đáp án + Lời giải (solcolor)", hint: "In kèm đáp án đúng, mục “Lời giải.” và dòng “Chọn đáp án … □”." },
];

const DEFAULT_EXAM_HEADER: ExamHeaderState = {
  department: "SỞ GD-ĐT AN GIANG",
  school: "TRƯỜNG THPT CHI LĂNG",
  examName: "ĐỀ KIỂM TRA GIỮA KỲ I",
  schoolYear: "2026 - 2027",
  subject: "TOÁN",
  grade: "12",
  duration: "90 phút",
  examCode: "101",
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const pad = (n: number) => String(n).padStart(2, "0");

function fileName(title: string, ext: "pdf" | "zip"): string {
  const slug = fold(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "cau-hoi";
  const d = new Date();
  return `${slug}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}

/** Hộp thoại "Xuất PDF": chọn chế độ, Bài tập / Bài kiểm tra, số đề, rồi biên dịch bằng TeX Live trên máy chủ. */
export const PdfExportDialog: React.FC<Props> = ({
  ids,
  defaultTitle = "Câu hỏi được chọn",
  allowMultiExam = false,
  defaultDocType = "exercise",
  onClose,
}) => {
  const [modes, setModes] = useState<Mode[]>(["exam"]);
  const [includeTex, setIncludeTex] = useState(true);
  const [docType, setDocType] = useState<DocType>(defaultDocType);
  const [title, setTitle] = useState(defaultTitle);
  const [examHeader, setExamHeader] = useState<ExamHeaderState>(DEFAULT_EXAM_HEADER);
  const [numExams, setNumExams] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [groupByType, setGroupByType] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const tooMany = ids.length > MAX_QUESTIONS;
  const effectiveNumExams = allowMultiExam ? Math.min(MAX_EXAMS, Math.max(1, numExams || 1)) : 1;
  const effectiveShuffle = effectiveNumExams > 1 || shuffle;
  const isZipBundle = includeTex || effectiveNumExams > 1 || modes.length > 1;

  const toggleMode = (m: Mode) =>
    setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const setField = (k: keyof ExamHeaderState, v: string) =>
    setExamHeader((prev) => ({ ...prev, [k]: v }));

  const run = async () => {
    setError("");
    setDone("");
    if (!ids.every((i) => UUID_RE.test(i))) {
      setError("Đang dùng dữ liệu mẫu (chưa kết nối backend) nên chưa thể xuất PDF. Hãy kết nối backend rồi thử lại.");
      return;
    }
    setBusy(true);
    try {
      let res: Response;
      try {
        res = await fetch(`${API}/api/export/questions-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids,
            title: title.trim(),
            modes,
            include_tex: includeTex,
            show_answers: modes.includes("answers") || modes.includes("solutions"),
            include_solutions: modes.includes("solutions"),
            show_ids: showIds,
            group_by_type: groupByType,
            doc_type: docType,
            exam_header:
              docType === "exam"
                ? {
                    department: examHeader.department.trim(),
                    school: examHeader.school.trim(),
                    exam_name: examHeader.examName.trim(),
                    school_year: examHeader.schoolYear.trim(),
                    subject: examHeader.subject.trim(),
                    grade: examHeader.grade.trim(),
                    duration: examHeader.duration.trim(),
                    exam_code: examHeader.examCode.trim() || "101",
                  }
                : null,
            num_exams: effectiveNumExams,
            shuffle: effectiveShuffle,
          }),
        });
      } catch {
        throw new Error("Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.");
      }
      if (!res.ok) {
        let detail = `Lỗi ${res.status}`;
        try {
          const j = await res.json();
          detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* giữ thông báo mặc định */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const isZip = isZipBundle || (res.headers.get("content-type") ?? "").includes("zip");
      const baseName = docType === "exam" ? examHeader.examName.trim() || "de-kiem-tra" : title.trim() || defaultTitle;
      const name = fileName(baseName, isZip ? "zip" : "pdf");
      downloadBlob(blob, name);
      setDone(
        isZip
          ? `Đã tạo ${name} (${effectiveNumExams} đề × ${modes.length} chế độ${includeTex ? ", kèm .tex" : ""}) – file đã được tải xuống.`
          : `Đã tạo ${name} (${ids.length} câu) – file đã được tải xuống.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "h-8 w-full rounded border border-gray-300 px-2.5 text-xs focus:border-indigo-400 focus:outline-hidden";

  return (
    <Modal
      title={
        <>
          <FileDown className="h-4 w-4 text-red-300" /> <span>Xuất PDF</span>
        </>
      }
      widthClass="max-w-xl"
      onClose={busy ? () => undefined : onClose}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 rounded border border-gray-300 bg-white px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            {done ? "ĐÓNG" : "HỦY"}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy || ids.length === 0 || tooMany || modes.length === 0}
            className="flex h-9 items-center gap-1.5 rounded bg-[#4A0E17] px-4 text-xs font-bold tracking-wide text-white transition hover:bg-[#5d1420] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            {busy ? "ĐANG BIÊN DỊCH…" : done ? "XUẤT LẠI" : isZipBundle ? "XUẤT FILE (.ZIP)" : "XUẤT PDF"}
          </button>
        </div>
      }
    >
      <div className="max-h-[75vh] space-y-3.5 overflow-y-auto pr-1 text-sm text-gray-800">
        <p className="text-xs leading-relaxed text-gray-600">
          Biên dịch <b>{ids.length}</b> câu hỏi thành file PDF bằng TeX Live (gói <code>ex_test.sty</code>).
          {(ids.length > 30 || effectiveNumExams > 2) && " Có thể mất vài chục giây."}
        </p>
        {tooMany && (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Mỗi lần chỉ xuất tối đa {MAX_QUESTIONS} câu (đang chọn {ids.length} câu). Hãy chọn ít câu hơn.
          </div>
        )}

        {/* Chế độ Bài tập / Bài kiểm tra */}
        <div>
          <span className="mb-1 block text-xs font-semibold text-gray-700">Hình thức đầu trang</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setDocType("exercise")}
              className={`rounded border px-3 py-2 text-left text-xs transition ${
                docType === "exercise"
                  ? "border-[#4A0E17] bg-[#4A0E17]/5 font-semibold text-[#4A0E17]"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              Bài tập
              <span className="block text-[11px] font-normal text-gray-500">Chỉ in tiêu đề bài tập</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDocType("exam")}
              className={`rounded border px-3 py-2 text-left text-xs transition ${
                docType === "exam"
                  ? "border-[#4A0E17] bg-[#4A0E17]/5 font-semibold text-[#4A0E17]"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              Bài kiểm tra
              <span className="block text-[11px] font-normal text-gray-500">Đầy đủ Sở, Trường, Họ tên, SBD, Mã đề</span>
            </button>
          </div>
        </div>

        {docType === "exercise" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Tiêu đề bài tập</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              placeholder="Để trống nếu muốn bắt đầu ngay từ PHẦN I."
              className="h-9 w-full rounded border border-gray-300 px-3 text-sm focus:border-indigo-400 focus:outline-hidden"
            />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 rounded border border-gray-200 bg-gray-50/70 p-3">
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Sở GD-ĐT</span>
              <input value={examHeader.department} onChange={(e) => setField("department", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Trường</span>
              <input value={examHeader.school} onChange={(e) => setField("school", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Tên bài kiểm tra</span>
              <input value={examHeader.examName} onChange={(e) => setField("examName", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Năm học</span>
              <input value={examHeader.schoolYear} onChange={(e) => setField("schoolYear", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Môn</span>
              <input value={examHeader.subject} onChange={(e) => setField("subject", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Khối / Lớp</span>
              <input value={examHeader.grade} onChange={(e) => setField("grade", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">Thời gian làm bài</span>
              <input value={examHeader.duration} onChange={(e) => setField("duration", e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-semibold text-gray-700">
                {effectiveNumExams > 1 ? "Mã đề bắt đầu (tự tăng, hoặc dùng x cho số ngẫu nhiên)" : "Mã đề (dùng x cho số ngẫu nhiên)"}
              </span>
              <input
                value={examHeader.examCode}
                onChange={(e) => setField("examCode", e.target.value)}
                disabled={busy}
                placeholder="VD: 101, 1xx, xxx"
                className={inputCls}
              />
            </label>
          </div>
        )}

        {/* Số đề & xáo trộn (dành cho Ma trận & Sinh đề) */}
        {allowMultiExam && (
          <div className="space-y-2 rounded border border-gray-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-gray-700" htmlFor="num-exams-input">
                Số đề cần tạo (1 – {MAX_EXAMS})
              </label>
              <input
                id="num-exams-input"
                type="number"
                min={1}
                max={MAX_EXAMS}
                value={numExams}
                disabled={busy}
                onChange={(e) => setNumExams(Math.min(MAX_EXAMS, Math.max(1, Number(e.target.value) || 1)))}
                className="h-8 w-20 rounded border border-gray-300 bg-white px-2 text-center text-xs font-semibold focus:border-indigo-400 focus:outline-hidden"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={effectiveShuffle}
                disabled={busy || effectiveNumExams > 1}
                onChange={(e) => setShuffle(e.target.checked)}
                className="accent-[#4A0E17]"
              />
              Xáo trộn câu hỏi trong từng phần &amp; cân bằng đáp án A, B, C, D (PHẦN I)
            </label>
            {effectiveNumExams > 1 && (
              <p className="text-[11px] text-amber-800">
                Sẽ xuất {effectiveNumExams} mã đề đã xáo trộn thành 1 file <code>.zip</code>.
              </p>
            )}
          </div>
        )}

        <fieldset className="space-y-1.5" disabled={busy}>
          <legend className="mb-1 text-xs font-semibold text-gray-700">Nội dung (chọn một hoặc nhiều)</legend>
          {MODES.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={modes.includes(m.id)}
                onChange={() => toggleMode(m.id)}
                className="mt-0.5 accent-[#4A0E17]"
              />
              <span>
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-gray-500">{m.hint}</span>
              </span>
            </label>
          ))}
          {modes.length === 0 && (
            <p className="text-[11px] text-rose-600">Vui lòng chọn ít nhất một chế độ xuất.</p>
          )}
        </fieldset>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-800">
            <input type="checkbox" checked={includeTex} onChange={(e) => setIncludeTex(e.target.checked)} disabled={busy} className="accent-[#4A0E17]" />
            Xuất kèm file <code>.tex</code> tương ứng với số đề tạo ra
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={groupByType} onChange={(e) => setGroupByType(e.target.checked)} disabled={busy} className="accent-[#4A0E17]" />
            Phân chia theo phần (PHẦN I, II, III, IV theo loại câu hỏi)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} disabled={busy} className="accent-[#4A0E17]" />
            In mã ID nhỏ cạnh số câu (để đối chiếu với ngân hàng)
          </label>
        </div>

        {error && (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-red-200 bg-red-50 p-3 font-mono text-[11px] leading-relaxed text-red-800">
            {error}
          </pre>
        )}
        {done && (
          <div className="flex items-start gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{done}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
