"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { API } from "@/lib/api";
import { Alert, Badge, Button, Card, Field, PageHeader } from "@/components/ui";

type ImportItem = {
  stt: number;
  question_type: string;
  question_code: string | null;
  answer: string | null;
};

type ImportResult = {
  total_extracted: number;
  total_saved: number;
  with_id_from_file?: number;
  auto_assigned?: number;
  without_id?: number;
  items?: ImportItem[];
};

const TYPE_TONE: Record<string, "indigo" | "green" | "amber" | "slate"> = {
  "Trắc nghiệm nhiều lựa chọn": "indigo",
  "Đúng - Sai": "green",
  "Trả lời ngắn": "amber",
  "Tự luận": "slate",
};

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  // Chọn file → phân tích ngay để xem trước (chưa lưu vào ngân hàng)
  async function onPick(f: File | null) {
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

  async function submit() {
    if (!file || items.length === 0) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/api/latex/upload-tex/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Nhập thất bại");
      setRes(j); setItems(j.items ?? items); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { setErr(e instanceof Error ? e.message : "Lỗi không xác định"); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Nhập đề LaTeX" desc="Tải file .tex (UTF-8) chứa các khối \begin{ex}…\end{ex}. Hệ thống tự nhận dạng loại câu, bóc tách ID, đáp án và lời giải; chọn file để xem trước rồi mới lưu." />
      <div className="max-w-5xl space-y-6">
        <Card className="max-w-xl space-y-4">
          <Field label="File .tex">
            <input ref={fileRef} type="file" accept=".tex" onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700" />
          </Field>
          <Button onClick={submit} disabled={!file || busy || previewing || items.length === 0} className="w-full">{busy ? "Đang lưu…" : "Lưu vào ngân hàng"}</Button>
          {file && !previewing && !err && items.length === 0 && <Alert kind="warn">Không tìm thấy khối \begin{"{"}ex{"}"}…\end{"{"}ex{"}"} nào trong file.</Alert>}
          {err && <Alert kind="error">{err}</Alert>}
          {res && (
            <Alert kind="success">
              Đã lưu {res.total_saved}/{res.total_extracted} câu.{(res.with_id_from_file ?? 0) > 0 && <> {res.with_id_from_file} câu đã có sẵn ID trong file (giữ nguyên).</>}{(res.auto_assigned ?? 0) > 0 && <> {res.auto_assigned} câu được gắn ID mới.</>}{(res.without_id ?? 0) > 0 && <> {res.without_id} câu chưa có ID.</>} <Link href="/questions" className="font-medium underline">Xem ngân hàng câu hỏi →</Link>
            </Alert>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Bảng thống kê{res ? "" : items.length > 0 ? " (xem trước – chưa lưu)" : ""}</h2>
            {items.length > 0 && <span className="text-xs text-slate-500">{items.length} câu</span>}
          </div>
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
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
    </>
  );
}
