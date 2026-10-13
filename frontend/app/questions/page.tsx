"use client";

import React, { useRef, useState } from "react";
import { QuestionBankDashboard } from "@/components/question-bank";
import { useQuestionBank } from "@/lib/use-question-bank";
import { downloadBlob, downloadText } from "@/lib/download";
import { buildTex } from "@/lib/matrix-io";
import { API, LEVELS, LEVEL_LABEL } from "@/lib/api";
import { Alert, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { UploadCloud, X } from "lucide-react";

export default function QuestionsPage() {
  const bank = useQuestionBank();

  // Các State dành cho chức năng Nhập (Import)
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ qid_level: "M1", qid_grade: "", qid_chapter: "", qid_lesson: "", qid_form: "", chapter: "", topic: "", difficulty_level: "", source_material: "" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ total_extracted: number; total_saved: number } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setMeta((m) => ({ ...m, [k]: v }));

  async function submitImport() {
    if (!file) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Chỉ gửi các trường có giá trị
      const filled = Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim()));
      if (meta.qid_grade) filled.grade_level = meta.qid_grade;
      fd.append("metadata", JSON.stringify(filled));
      
      const r = await fetch(`${API}/api/latex/upload-tex/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "Nhập thất bại");
      
      setRes(j); 
      setFile(null); 
      if (fileRef.current) fileRef.current.value = "";
      
      // Tải lại dữ liệu ngân hàng sau khi nhập xong
      bank.reloadAutoTree();
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
        <PageHeader title="Quản lý câu hỏi" desc="Xem, sửa, xóa, gắn ID và bổ sung câu hỏi từ file LaTeX vào ngân hàng dữ liệu." />
        <Button 
          onClick={() => setShowImport(!showImport)}
          className={`flex items-center gap-2 ${showImport ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : ''}`}
          variant={showImport ? 'outline' : 'default'}
        >
          {showImport ? <X className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
          {showImport ? "Đóng form nhập" : "Nhập đề LaTeX"}
        </Button>
      </div>

      {/* Vùng Import (Chỉ hiện khi bấm nút) */}
      {showImport && (
        <div className="grid max-w-full gap-6 lg:grid-cols-2 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 p-4">
          <Card className="space-y-4 border-none shadow-sm">
            <Field label="File .tex tải lên">
              <input ref={fileRef} type="file" accept=".tex" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
            </Field>
            <p className="text-xs text-slate-500">Dữ liệu phân loại bên phải sẽ được gán làm mặc định cho <b>tất cả</b> các câu trong file này.</p>
            <Button onClick={submitImport} disabled={!file || busy} className="w-full h-10">
              {busy ? "Đang nhập..." : "Bắt đầu nhập vào ngân hàng"}
            </Button>
            {err && <Alert kind="error">{err}</Alert>}
            {res && (
              <Alert kind="success">
                Đã tìm thấy {res.total_extracted} câu, lưu mới {res.total_saved} câu thành công.
              </Alert>
            )}
          </Card>
          
          <Card className="space-y-3 border-none shadow-sm">
            <h2 className="font-medium text-sm text-slate-800">Thông tin phân loại mặc định & Gắn ID (Tùy chọn)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Mức độ">
                <select className={inputCls} value={meta.qid_level} onChange={(e) => set("qid_level", e.target.value)}>
                  <option value="M1">Nhận biết (M1)</option>
                  <option value="M2">Thông hiểu (M2)</option>
                  <option value="M3">Vận dụng (M3)</option>
                  <option value="M4">Vận dụng cao (M4)</option>
                </select>
              </Field>
              <Field label="Lớp">
                <select className={inputCls} value={meta.qid_grade} onChange={(e) => set("qid_grade", e.target.value)}>
                  <option value="">—</option>
                  {[10, 11, 12].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
              </Field>
              <Field label="Chương"><input type="number" min={1} className={inputCls} placeholder="1" value={meta.qid_chapter} onChange={(e) => set("qid_chapter", e.target.value)} /></Field>
              <Field label="Bài"><input type="number" min={1} className={inputCls} placeholder="3" value={meta.qid_lesson} onChange={(e) => set("qid_lesson", e.target.value)} /></Field>
              <Field label="Dạng"><input type="number" min={1} className={inputCls} placeholder="1" value={meta.qid_form} onChange={(e) => set("qid_form", e.target.value)} /></Field>
            </div>
            
            <p className="text-[11.5px]">
              {meta.qid_grade && meta.qid_chapter && meta.qid_lesson ? (
                <>Mã xem trước: <code className="font-semibold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">TN.{meta.qid_level}.T{Number(meta.qid_grade) - 10}.C{Number(meta.qid_chapter)}.B{Number(meta.qid_lesson)}{meta.qid_form ? "." + String(Number(meta.qid_form)).padStart(2, "0") : ""}</code> (Loại câu TN sẽ tự đổi theo nội dung thực tế)</>
              ) : (
                <span className="text-slate-400">Điền Lớp, Chương, Bài để tự gắn ID ngay lập tức. Bạn cũng có thể bỏ trống để gắn ID bằng tay sau.</span>
              )}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Field label="Chuyên đề"><input className={inputCls} placeholder="VD: Tính đơn điệu" value={meta.topic} onChange={(e) => set("topic", e.target.value)} /></Field>
              <Field label="Nguồn tài liệu"><input className={inputCls} placeholder="VD: Đề thi thử Sở GD" value={meta.source_material} onChange={(e) => set("source_material", e.target.value)} /></Field>
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
        treeMode={bank.treeMode}
        hasManualTree={bank.hasManualTree}
        onTreeModeChange={bank.setTreeMode}
        onReloadTree={bank.reloadAutoTree}
        onLoadTreeFile={bank.loadTreeFile}
        onResetTree={bank.resetTree}
        onSaveContent={(id, raw) => bank.updateQuestion(id, { raw })}
        onSaveId={(id, code) => bank.updateQuestion(id, { code })}
        onDeleteQuestion={bank.deleteQuestion}
        onExportAction={handleExport}
      />
    </div>
  );
}