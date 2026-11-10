"use client";

import React, { useRef, useState } from "react";
import { QuestionBankDashboard } from "@/components/question-bank";
import { useQuestionBank } from "@/lib/use-question-bank";
import { downloadBlob, downloadText } from "@/lib/download";
import { buildTex } from "@/lib/matrix-io";
import { API } from "@/lib/api";
import { PENDING_ID } from "@/lib/tree";
import { Alert, Badge, Button, Card, Field, PageHeader } from "@/components/ui";
import { History, UploadCloud, X } from "lucide-react";
import { ImportLogPanel } from "@/components/question-bank/ImportLogPanel";

type ImportItem = {
  stt: number;
  question_type: string;
  question_code: string | null;
  answer: string | null;
};

const TYPE_TONE: Record<string, "indigo" | "green" | "amber" | "slate"> = {
  "Trắc nghiệm nhiều lựa chọn": "indigo",
  "Đúng - Sai": "green",
  "Trả lời ngắn": "amber",
  "Tự luận": "slate",
};

export default function QuestionsPage() {
  const bank = useQuestionBank();

  // Các State dành cho chức năng Nhập (Import)
  const [showImport, setShowImport] = useState(false);
  // Nhật ký các file .tex đã nhập (logKey tăng lên để tải lại sau mỗi lần nhập)
  const [showLog, setShowLog] = useState(false);
  const [logKey, setLogKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [res, setRes] = useState<{ total_extracted: number; total_saved: number; with_id_from_file?: number; auto_assigned?: number; without_id?: number; duplicate_summary?: { exact: number; similar: number; diff_data: number; flagged: number } | null } | null>(null);
  const [err, setErr] = useState("");
  const reqId = useRef(0);
  // Yêu cầu dashboard mở mục "Câu hỏi chờ kiểm duyệt" (đổi nonce để chuyển được nhiều lần)
  const [jumpTo, setJumpTo] = useState<{ id: string; nonce: number } | null>(null);
  const openPending = () => setJumpTo({ id: PENDING_ID, nonce: Date.now() });

  // Chọn file -> phân tích ngay để xem trước thống kê (CHƯA lưu vào ngân hàng)
  async function onPickFile(f: File | null) {
    const id = ++reqId.current;
    setFile(f); setRes(null); setErr(""); setItems([]);
    if (!f) return;
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API}/api/latex/preview-tex/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Không đọc được file");
      if (id === reqId.current) setItems(j.items ?? []);
    } catch (e) {
      if (id === reqId.current) setErr(e instanceof Error ? e.message : "Lỗi không xác định");
    }
    if (id === reqId.current) setPreviewing(false);
  }

  async function submitImport() {
    if (!file || items.length === 0) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/api/latex/upload-tex/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Nhập thất bại");

      setRes(j);
      setItems(j.items ?? items);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";

      setLogKey((k) => k + 1);

      // Tải lại dữ liệu: câu vừa nhập nằm ở mục "Câu hỏi chờ kiểm duyệt" (chưa vào ngân hàng)
      await bank.reloadQuestions();
      openPending();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi không xác định");
    }
    setBusy(false);
  }

  // Xử lý xuất file
  const handleExport = async (format: string, selectedIds: string[]) => {
    const list = selectedIds.map((id) => bank.questionMap.get(id)).filter((q) => q !== undefined);
    if (format === "latex") {
      downloadText(buildTex(list, { name: "Ngân hàng câu hỏi", solutions: true }), `ngan-hang-cau-hoi-${Date.now()}.tex`);
    } else if (format === "excel") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        list.map((q, i) => ({
          "STT": i + 1,
          "Mã câu hỏi": q.code,
          "Kiểu": q.type,
          "Mức độ": q.level ?? "",
          "Đề bài": q.content,
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      downloadBlob(new Blob([buf]), `ngan-hang-cau-hoi-${Date.now()}.xlsx`);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Khung Header với Nút Mở/Đóng Import */}
      <div className="flex items-center justify-between">
        <PageHeader title="Quản lý câu hỏi" desc="Xem, sửa, xóa, gắn ID câu hỏi. Câu nhập từ file LaTeX sẽ vào mục “Câu hỏi chờ kiểm duyệt” để duyệt trước khi đưa vào ngân hàng." />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-2"
            variant="ghost"
          >
            <History className="w-4 h-4" />
            {showLog ? "Ẩn nhật ký nhập" : "Nhật ký nhập file"}
          </Button>
          <Button 
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-2"
            variant={showImport ? 'ghost' : 'primary'}
          >
            {showImport ? <X className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
            {showImport ? "Đóng form nhập" : "Nhập đề LaTeX"}
          </Button>
        </div>
      </div>

      {/* Nhật ký các file .tex đã nhập: ngày nhập, tên file, số câu + tìm kiếm */}
      {showLog && (
        <Card className="space-y-2">
          <h2 className="text-sm font-medium text-slate-800">Nhật ký nhập file .tex</h2>
          <ImportLogPanel refreshKey={logKey} />
        </Card>
      )}

      {/* Vùng Import (Chỉ hiện khi bấm nút) */}
      {showImport && (
        <div className="max-w-full space-y-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 p-4">
          <Card className="max-w-xl space-y-4 border-none shadow-sm">
            <Field label="File .tex tải lên">
              <input ref={fileRef} type="file" accept=".tex" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
            </Field>
            <p className="text-xs text-slate-500">Chọn file để xem trước bảng thống kê bên dưới, kiểm tra xong mới bấm nhập. Câu nhập vào <b>chưa vào ngân hàng ngay</b> mà nằm ở mục <b>“Câu hỏi chờ kiểm duyệt”</b> trên cây mục lục; bạn duyệt từng câu hoặc hàng loạt để đưa vào ngân hàng. Câu đã có ID ở dòng đầu khối (VD <code>\begin{"{"}ex{"}"}%[TN.M2.T2.C1.B3.05]</code>) sẽ được <b>giữ nguyên ID</b>; các câu còn lại để trống ID, bạn gắn sau trong ngân hàng câu hỏi.</p>
            <Button onClick={submitImport} disabled={!file || busy || previewing || items.length === 0} className="w-full h-10">
              {busy ? "Đang nhập..." : "Nhập vào mục chờ kiểm duyệt"}
            </Button>
            {file && !previewing && !err && items.length === 0 && <Alert kind="warn">Không tìm thấy khối \begin{"{"}ex{"}"}…\end{"{"}ex{"}"} nào trong file.</Alert>}
            {err && <Alert kind="error">{err}</Alert>}
            {res && (
              <Alert kind="success">
                Đã đưa {res.total_saved}/{res.total_extracted} câu vào mục “Câu hỏi chờ kiểm duyệt” (chưa vào ngân hàng).
                {(res.with_id_from_file ?? 0) > 0 && <> {res.with_id_from_file} câu đã có sẵn ID trong file (giữ nguyên ID).</>}
                {(res.without_id ?? 0) > 0 && <> {res.without_id} câu chưa có ID — bạn có thể gắn ID ngay khi kiểm duyệt.</>}
                {res.duplicate_summary && res.duplicate_summary.exact + res.duplicate_summary.similar > 0 && (
                  <> ⚠ {res.duplicate_summary.exact + res.duplicate_summary.similar} câu nghi trùng nội dung — xem ở mục chờ kiểm duyệt.</>
                )}
                {res.duplicate_summary && res.duplicate_summary.diff_data > 0 && (
                  <> {res.duplicate_summary.diff_data} câu giống nhưng khác số liệu.</>
                )}{" "}
                <button type="button" onClick={openPending} className="font-medium underline">Mở mục chờ kiểm duyệt →</button>
              </Alert>
            )}
          </Card>

          <Card className="space-y-3 border-none shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium text-sm text-slate-800">Bảng thống kê{res ? "" : items.length > 0 ? " (xem trước – chưa nhập)" : ""}</h2>
              {items.length > 0 && <span className="text-xs text-slate-500">{items.length} câu</span>}
            </div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-slate-600">
                  <tr>
                    <th className="w-20 px-3 py-2">STT câu</th>
                    <th className="px-3 py-2">Loại câu hỏi</th>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Đáp án</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">{previewing ? "Đang phân tích file…" : "Chưa có dữ liệu — hãy chọn một file .tex để xem thống kê."}</td></tr>
                  ) : items.map((it) => (
                    <tr key={it.stt} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">{it.stt}</td>
                      <td className="px-3 py-2"><Badge tone={TYPE_TONE[it.question_type] ?? "slate"}>{it.question_type}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{it.question_code ?? ""}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{it.answer ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Khung Ngân hàng câu hỏi bên dưới (Hiển thị list, sửa, xóa, update ID) */}
      <QuestionBankDashboard
        questions={bank.questions}
        treeData={bank.tree}
        treeSource={bank.treeSource}
        treeWarnings={bank.treeWarnings}
        dataSource={bank.source}
        dataError={bank.loadError}
        treeMode={bank.treeMode}
        hasManualTree={bank.hasManualTree}
        onTreeModeChange={bank.setTreeMode}
        onReloadTree={bank.reloadAutoTree}
        onLoadTreeFile={bank.loadTreeFile}
        onResetTree={bank.resetTree}
        onSaveContent={(id, raw) => bank.updateQuestion(id, { raw })}
        onSaveId={(id, code) => bank.updateQuestion(id, { code })}
        onDeleteQuestion={bank.deleteQuestion}
        pendingQuestions={bank.pending}
        onApprovePending={bank.approvePending}
        onRejectPending={bank.rejectPending}
        duplicates={bank.duplicates}
        onDismissDuplicates={bank.dismissDuplicates}
        onReplaceWithPending={bank.replaceWithPending}
        jumpTo={jumpTo}
        onExportAction={handleExport}
      />
    </div>
  );
}