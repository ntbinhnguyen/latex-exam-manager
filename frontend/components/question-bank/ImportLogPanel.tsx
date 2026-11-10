"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { api, post } from "@/lib/api";

interface ImportLog {
  id: string;
  filename: string;
  question_count: number;
  imported_at: string | null;
}

interface Props {
  /** Đổi giá trị này (vd. tăng số) để tải lại nhật ký sau khi vừa nhập file */
  refreshKey?: number;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dd/mm/yyyy HH:mm theo giờ máy người dùng */
function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Bỏ dấu + chữ thường để tìm "kiem tra" ra được "Kiểm tra". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/** Nhật ký các file .tex đã nhập: ngày nhập, tên file, số câu + khung tìm kiếm (theo tên file hoặc ngày). */
export const ImportLogPanel: React.FC<Props> = ({ refreshKey = 0, className = "" }) => {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ total: number; data: ImportLog[] }>("/api/latex/import-logs?limit=2000");
      setLogs(res.data);
      setSelected((prev) => new Set([...prev].filter((id) => res.data.some((l) => l.id === id))));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được nhật ký nhập file.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const rows = useMemo(() => {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return logs;
    return logs.filter((l) => {
      const hay = fold(`${l.filename} ${formatDateTime(l.imported_at)}`);
      return terms.every((t) => hay.includes(t)); // mọi từ khóa đều phải khớp
    });
  }, [logs, query]);

  // Chỉ thao tác trên các dòng đang hiển thị (sau khi lọc tìm kiếm)
  const selectedRows = rows.filter((l) => selected.has(l.id));
  const allVisibleSelected = rows.length > 0 && selectedRows.length === rows.length;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((l) => next.delete(l.id));
      else rows.forEach((l) => next.add(l.id));
      return next;
    });

  /** Xóa nhật ký (chỉ xóa dòng nhật ký, KHÔNG xóa câu hỏi đã nhập). */
  const removeLogs = async (targets: ImportLog[], everything = false) => {
    if (targets.length === 0) return;
    const what = targets.length === 1 ? `dòng nhật ký “${targets[0].filename}”` : `${targets.length} dòng nhật ký`;
    if (!window.confirm(`Xóa ${what}?\n\nChỉ xóa nhật ký, các câu hỏi đã nhập không bị ảnh hưởng.`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await post<{ deleted: number }>("/api/latex/import-logs/delete", {
        ids: targets.map((l) => l.id),
        all: everything,
      });
      setNotice(`Đã xóa ${res.deleted} dòng nhật ký.`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được nhật ký.");
    } finally {
      setDeleting(false);
    }
  };

  const filtering = query.trim().length > 0;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên file hoặc ngày (VD: de_1010, 11/2026)"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-hidden"
          />
        </div>
        <span className="text-xs text-slate-500">
          {loading ? "Đang tải…" : filtering ? `${rows.length} / ${logs.length} lượt nhập` : `${logs.length} lượt nhập`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => removeLogs(selectedRows)}
            disabled={selectedRows.length === 0 || deleting}
            className="flex h-8 items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa đã chọn ({selectedRows.length})
          </button>
          <button
            type="button"
            onClick={() => removeLogs(rows, !filtering)}
            disabled={rows.length === 0 || deleting}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> {filtering ? `Xóa ${rows.length} dòng đang lọc` : "Xóa tất cả"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="font-semibold underline">Đóng</button>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="max-h-[22rem] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-slate-600">
            <tr>
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={rows.length === 0}
                  aria-label="Chọn tất cả các dòng đang hiển thị"
                  className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
                />
              </th>
              <th className="w-44 px-3 py-2">Ngày nhập</th>
              <th className="px-3 py-2">Tên file</th>
              <th className="w-24 px-3 py-2 text-right">Số câu</th>
              <th className="w-12 px-3 py-2" aria-label="Xóa" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  {loading
                    ? "Đang tải nhật ký…"
                    : logs.length === 0
                      ? "Chưa có file .tex nào được nhập."
                      : "Không có lượt nhập nào khớp từ khóa."}
                </td>
              </tr>
            ) : (
              rows.map((l) => (
                <tr key={l.id} className={selected.has(l.id) ? "bg-indigo-50/60" : "hover:bg-slate-50"}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      aria-label={`Chọn ${l.filename}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(l.imported_at)}</td>
                  <td className="break-all px-3 py-2 font-medium text-slate-800">{l.filename}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{l.question_count}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLogs([l])}
                      disabled={deleting}
                      title="Xóa dòng nhật ký này"
                      className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
