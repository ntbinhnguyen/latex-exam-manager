"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { API, LEVELS, LEVEL_LABEL } from "@/lib/api";
import { Alert, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ qid_grade: "", qid_chapter: "", qid_lesson: "", qid_form: "", chapter: "", topic: "", difficulty_level: "", source_material: "" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ total_extracted: number; total_saved: number } | null>(null);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setMeta((m) => ({ ...m, [k]: v }));

  async function submit() {
    if (!file) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // chỉ gửi các trường có giá trị
      const filled = Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim()));
      if (meta.qid_grade) filled.grade_level = meta.qid_grade;
      fd.append("metadata", JSON.stringify(filled));
      const r = await fetch(`${API}/api/latex/upload-tex/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "Nhập thất bại");
      setRes(j); setFile(null); if (fileRef.current) fileRef.current.value = "";
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi không xác định"); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Nhập đề LaTeX" desc="Tải file .tex (UTF-8) chứa các khối \begin{ex}…\end{ex}. Hệ thống tự nhận dạng loại câu và tách lời giải." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <Field label="File .tex">
            <input ref={fileRef} type="file" accept=".tex" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700" />
          </Field>
          <p className="text-xs text-slate-500">Dữ liệu bên phải sẽ được gán cho <b>tất cả</b> câu trong file này (có thể sửa lại từng câu sau).</p>
          <Button onClick={submit} disabled={!file || busy} className="w-full">{busy ? "Đang nhập…" : "Nhập vào ngân hàng"}</Button>
          {err && <Alert kind="error">{err}</Alert>}
          {res && (
            <Alert kind="success">
              Đã tìm thấy {res.total_extracted} câu, lưu {res.total_saved} câu. <Link href="/questions" className="font-medium underline">Xem ngân hàng câu hỏi →</Link>
            </Alert>
          )}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-medium">Thông tin phân loại mặc định</h2>
          <p className="text-xs text-slate-500">
            Chọn vị trí trên cây mục lục để tự gắn ID cho từng câu, dạng <code>T0.TN.C1.B3.01</code> (Lớp.Loại.Chương.Bài.Dạng). Phần <b>loại câu</b> (TN, DS, TLN, TL) do hệ thống tự nhận dạng.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Lớp">
              <select className={inputCls} value={meta.qid_grade} onChange={(e) => set("qid_grade", e.target.value)}>
                <option value="">—</option>
                {[10, 11, 12].map((g) => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
            </Field>
            <Field label="Chương"><input type="number" min={1} className={inputCls} placeholder="1" value={meta.qid_chapter} onChange={(e) => set("qid_chapter", e.target.value)} /></Field>
            <Field label="Bài"><input type="number" min={1} className={inputCls} placeholder="3" value={meta.qid_lesson} onChange={(e) => set("qid_lesson", e.target.value)} /></Field>
            <Field label="Dạng (tùy chọn)"><input type="number" min={1} className={inputCls} placeholder="1" value={meta.qid_form} onChange={(e) => set("qid_form", e.target.value)} /></Field>
          </div>
          <p className="text-xs">
            {meta.qid_grade && meta.qid_chapter && meta.qid_lesson ? (
              <>Mã sẽ gán: <code className="font-semibold text-indigo-700">T{Number(meta.qid_grade) - 10}.TN.C{Number(meta.qid_chapter)}.B{Number(meta.qid_lesson)}{meta.qid_form ? "." + String(Number(meta.qid_form)).padStart(2, "0") : ""}</code> (TN thay bằng loại thực tế của từng câu)</>
            ) : (
              <span className="text-slate-400">Điền Lớp, Chương, Bài để tự gắn ID (có thể bỏ trống rồi gắn ID sau trong Ngân hàng câu hỏi).</span>
            )}
          </p>
          <Field label="Tên chương (ghi chú)"><input className={inputCls} placeholder="VD: Hàm số" value={meta.chapter} onChange={(e) => set("chapter", e.target.value)} /></Field>
          <Field label="Chuyên đề"><input className={inputCls} placeholder="VD: Tính đơn điệu" value={meta.topic} onChange={(e) => set("topic", e.target.value)} /></Field>
          <Field label="Mức độ">
            <select className={inputCls} value={meta.difficulty_level} onChange={(e) => set("difficulty_level", e.target.value)}>
              <option value="">— Chưa xác định —</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l} – {LEVEL_LABEL[l]}</option>)}
            </select>
          </Field>
          <Field label="Nguồn tài liệu"><input className={inputCls} placeholder="VD: Đề thi thử Sở GD 2026" value={meta.source_material} onChange={(e) => set("source_material", e.target.value)} /></Field>
        </Card>
      </div>
    </>
  );
}
