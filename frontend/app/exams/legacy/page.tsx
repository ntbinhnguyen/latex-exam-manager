"use client";
import { useEffect, useState } from "react";
import { API, api, post, LEVELS, TYPES } from "@/lib/api";
import { Alert, Badge, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";

type Cell = { chapter: string; topic: string; question_type: string; difficulty_level: string; required_count: number };
type Matrix = { id: string; name: string; grade_level: string | null; total_questions: number; cells: number };
type Report = { is_feasible: boolean; report: { cell_id: string; topic: string | null; type: string; difficulty: string; required: number; available: number; status: string; missing: number }[] };
type Version = { id: string; version_code: string; question_count: number };

const blank = (): Cell => ({ chapter: "", topic: "", question_type: TYPES[0], difficulty_level: "NB", required_count: 1 });

export default function ExamsPage() {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [name, setName] = useState("");
  const [cells, setCells] = useState<Cell[]>([blank()]);
  const [sel, setSel] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const [cfg, setCfg] = useState({ name: "", number_of_versions: 1, allow_duplicates: false });
  const [versions, setVersions] = useState<Version[]>([]);
  const [withSol, setWithSol] = useState(false);
  const [msg, setMsg] = useState<{ k: "error" | "success"; t: string } | null>(null);

  const loadMatrices = () => api<Matrix[]>("/api/exams/matrices").then(setMatrices).catch((e) => setMsg({ k: "error", t: e.message }));
  useEffect(() => { loadMatrices(); }, []);

  const upd = (i: number, k: keyof Cell, v: string | number) => setCells((c) => c.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = cells.reduce((s, c) => s + (Number(c.required_count) || 0), 0);

  async function saveMatrix() {
    try {
      const body = { name, cells: cells.map((c) => ({ ...c, chapter: c.chapter || null, topic: c.topic || null, required_count: Number(c.required_count) })) };
      const r = await post<{ id: string }>("/api/exams/matrices", body);
      setMsg({ k: "success", t: "Đã lưu ma trận." }); setName(""); setCells([blank()]); await loadMatrices(); setSel(r.id); setRep(null); setVersions([]);
    } catch (e) { setMsg({ k: "error", t: e instanceof Error ? e.message : "Lỗi" }); }
  }

  async function check() {
    try { setRep(await api<Report>(`/api/exams/matrix/${sel}/check-feasibility`)); setMsg(null); }
    catch (e) { setMsg({ k: "error", t: e instanceof Error ? e.message : "Lỗi" }); }
  }

  async function generate() {
    try {
      const c = await post<{ id: string }>("/api/exams/configs", { matrix_id: sel, ...cfg, number_of_versions: Number(cfg.number_of_versions) });
      const r = await post<{ message: string }>(`/api/exams/generate/${c.id}`, {});
      setVersions(await api<Version[]>(`/api/exams/configs/${c.id}/versions`));
      setMsg({ k: "success", t: r.message });
    } catch (e) { setMsg({ k: "error", t: e instanceof Error ? e.message : "Lỗi" }); }
  }

  return (
    <>
      <PageHeader title="Ma trận & Sinh đề" desc="Quy trình: ① Tạo ma trận → ② Kiểm tra khả thi → ③ Sinh mã đề → ④ Tải file .tex" />
      {msg && <div className="mb-4"><Alert kind={msg.k}>{msg.t}</Alert></div>}

      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="font-medium">① Tạo ma trận đề</h2>
          <Field label="Tên ma trận"><input className={`${inputCls} max-w-md`} placeholder="VD: Kiểm tra 15 phút – Chương 1" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1">Dạng câu</th><th>Mức độ</th><th>Chương (tùy chọn)</th><th>Chuyên đề (tùy chọn)</th><th className="w-24">Số câu</th><th /></tr></thead>
              <tbody>
                {cells.map((c, i) => (
                  <tr key={i}>
                    <td className="pr-2 pb-2"><select className={inputCls} value={c.question_type} onChange={(e) => upd(i, "question_type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                    <td className="pr-2 pb-2"><select className={inputCls} value={c.difficulty_level} onChange={(e) => upd(i, "difficulty_level", e.target.value)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></td>
                    <td className="pr-2 pb-2"><input className={inputCls} value={c.chapter} onChange={(e) => upd(i, "chapter", e.target.value)} /></td>
                    <td className="pr-2 pb-2"><input className={inputCls} value={c.topic} onChange={(e) => upd(i, "topic", e.target.value)} /></td>
                    <td className="pr-2 pb-2"><input type="number" min={1} className={inputCls} value={c.required_count} onChange={(e) => upd(i, "required_count", e.target.value)} /></td>
                    <td className="pb-2"><button className="text-slate-400 hover:text-red-500" onClick={() => setCells((x) => x.filter((_, j) => j !== i))} disabled={cells.length === 1}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setCells((c) => [...c, blank()])}>+ Thêm dòng</Button>
            <Button onClick={saveMatrix} disabled={!name.trim()}>Lưu ma trận</Button>
            <span className="text-sm text-slate-500">Tổng: <b>{total}</b> câu</span>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-medium">② Kiểm tra khả thi & ③ Sinh đề</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Chọn ma trận">
              <select className={`${inputCls} min-w-64`} value={sel} onChange={(e) => { setSel(e.target.value); setRep(null); setVersions([]); }}>
                <option value="">— Chọn —</option>
                {matrices.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.total_questions} câu)</option>)}
              </select>
            </Field>
            <Button variant="ghost" disabled={!sel} onClick={check}>Kiểm tra khả thi</Button>
          </div>

          {rep && (
            <>
              <Alert kind={rep.is_feasible ? "success" : "error"}>{rep.is_feasible ? "Ngân hàng đủ câu hỏi để sinh đề." : "Ngân hàng chưa đủ câu hỏi — hãy nhập thêm hoặc giảm số câu yêu cầu."}</Alert>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Dạng</th><th>Mức độ</th><th>Chuyên đề</th><th className="text-right">Cần</th><th className="text-right">Có</th><th className="text-right">Trạng thái</th></tr></thead>
                <tbody>{rep.report.map((r) => (
                  <tr key={r.cell_id} className="border-t border-slate-100">
                    <td className="py-2">{r.type}</td><td>{r.difficulty}</td><td>{r.topic ?? "—"}</td>
                    <td className="text-right">{r.required}</td><td className="text-right">{r.available}</td>
                    <td className="text-right">{r.status === "OK" ? <Badge tone="green">Đủ</Badge> : <Badge tone="red">Thiếu {r.missing}</Badge>}</td>
                  </tr>))}</tbody>
              </table>
            </>
          )}

          {sel && (
            <div className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-4">
              <Field label="Tên kỳ thi"><input className={inputCls} value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></Field>
              <Field label="Số mã đề"><input type="number" min={1} max={20} className={inputCls} value={cfg.number_of_versions} onChange={(e) => setCfg({ ...cfg, number_of_versions: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={cfg.allow_duplicates} onChange={(e) => setCfg({ ...cfg, allow_duplicates: e.target.checked })} />Cho phép trùng câu giữa các mã đề</label>
              <div className="pt-5"><Button onClick={generate} disabled={!cfg.name.trim()} className="w-full">Sinh đề</Button></div>
            </div>
          )}
        </Card>

        {versions.length > 0 && (
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">④ Mã đề đã sinh</h2>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withSol} onChange={(e) => setWithSol(e.target.checked)} />Kèm lời giải</label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="text-xl font-semibold">Mã {v.version_code}</div>
                  <div className="mb-3 text-sm text-slate-500">{v.question_count} câu</div>
                  <a className="inline-block rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    href={`${API}/api/exams/versions/${v.id}/export-tex?include_solutions=${withSol}`}>Tải .tex</a>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
