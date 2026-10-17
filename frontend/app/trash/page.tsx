"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, RotateCcw, Search, Trash2 } from "lucide-react";
import { api, post, type Question } from "@/lib/api";
import { mapBackendQuestion } from "@/lib/question-mapper";
import { QuestionBody } from "@/components/question-bank/QuestionBody";
import { LEVEL_NAMES } from "@/components/question-bank/types";
import { Alert, Badge, Button, Card, PageHeader, inputCls } from "@/components/ui";

const PAGE_SIZE = 20;

type TrashRow = { raw: Question; item: ReturnType<typeof mapBackendQuestion> };
type PurgeResult = { purged: number; skipped: { id: string; question_code: string | null; reason: string }[] };

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
}

export default function TrashPage() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "warn"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const skip = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (query) params.set("q", query);
      const res = await api<{ total: number; data: Question[] }>(`/api/questions/trash?${params}`);
      // Xóa hẳn/phục hồi hết trang cuối -> lùi về trang trước
      if (res.data.length === 0 && res.total > 0 && page > 1) {
        setPage((p) => p - 1);
        return;
      }
      setTotal(res.total);
      setRows(res.data.map((q, i) => ({ raw: q, item: mapBackendQuestion(q, skip + i) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [page, query]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) load();
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.raw.id));
  const selectedCount = selected.size;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.raw.id));
      else rows.forEach((r) => next.add(r.raw.id));
      return next;
    });

  /** Chạy một thao tác, báo kết quả và tải lại danh sách. */
  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice(null);
    try {
      const text = await action();
      setNotice({ kind: "success", text });
      setSelected(new Set());
      setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const purgeMsg = (r: PurgeResult) => {
    if (r.skipped.length === 0) return `Đã xóa hẳn ${r.purged} câu hỏi.`;
    return `Đã xóa hẳn ${r.purged} câu. Giữ lại ${r.skipped.length} câu vì đang được dùng trong đề thi đã sinh: ${r.skipped
      .map((s) => s.question_code || "(chưa có ID)")
      .join(", ")}.`;
  };

  const restoreOne = (r: TrashRow) =>
    run(async () => {
      await post(`/api/questions/${r.raw.id}/restore`, {});
      return `Đã phục hồi câu ${r.item.code}.`;
    });

  const purgeOne = (r: TrashRow) => {
    if (!window.confirm(`Xóa HẲN câu ${r.item.code}?\n\nThao tác này không thể hoàn tác.`)) return;
    run(async () => {
      const res = await post<PurgeResult>("/api/questions/trash/purge", { ids: [r.raw.id] });
      if (res.purged === 0) throw new Error(res.skipped[0]?.reason ?? "Không xóa được câu hỏi.");
      return `Đã xóa hẳn câu ${r.item.code}.`;
    });
  };

  const restoreSelected = () =>
    run(async () => {
      const res = await post<{ restored: number }>("/api/questions/trash/restore", { ids: [...selected] });
      return `Đã phục hồi ${res.restored} câu hỏi.`;
    });

  const purgeSelected = () => {
    if (!window.confirm(`Xóa HẲN ${selectedCount} câu hỏi đã chọn?\n\nThao tác này không thể hoàn tác.`)) return;
    run(async () => purgeMsg(await post<PurgeResult>("/api/questions/trash/purge", { ids: [...selected] })));
  };

  const restoreAll = () => {
    if (!window.confirm(`Phục hồi toàn bộ ${total} câu trong thùng rác về ngân hàng?`)) return;
    run(async () => {
      const res = await post<{ restored: number }>("/api/questions/trash/restore", { all: true });
      return `Đã phục hồi ${res.restored} câu hỏi.`;
    });
  };

  const emptyTrash = () => {
    if (!window.confirm(`Dọn sạch thùng rác: xóa HẲN toàn bộ ${total} câu hỏi?\n\nThao tác này không thể hoàn tác.`)) return;
    run(async () => purgeMsg(await post<PurgeResult>("/api/questions/trash/purge", { all: true })));
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelected(new Set());
    setPage(1);
    setQuery(search.trim());
  };

  const empty = useMemo(() => !loading && !error && total === 0, [loading, error, total]);

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Thùng rác"
        desc="Các câu hỏi đã xóa (xóa mềm). Bạn có thể phục hồi về ngân hàng hoặc xóa hẳn khỏi cơ sở dữ liệu."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={restoreAll} disabled={busy || total === 0}>
            <RotateCcw className="mr-1.5 inline h-4 w-4" />
            Phục hồi tất cả
          </Button>
          <Button variant="danger" onClick={emptyTrash} disabled={busy || total === 0}>
            <Trash2 className="mr-1.5 inline h-4 w-4" />
            Dọn sạch thùng rác
          </Button>
        </div>
      </PageHeader>

      <Card className="space-y-3 !p-4">
        <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Tìm theo mã ID hoặc nội dung LaTeX…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="ghost">Tìm</Button>
          {query && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setSearch(""); setQuery(""); setPage(1); }}
            >
              Xóa lọc
            </Button>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {total} câu trong thùng rác{query ? " (đã lọc)" : ""}
          </span>
        </form>

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm">
            <span className="font-medium text-indigo-800">Đã chọn {selectedCount} câu</span>
            <Button onClick={restoreSelected} disabled={busy} className="!py-1.5">
              <RotateCcw className="mr-1.5 inline h-4 w-4" />
              Phục hồi
            </Button>
            <Button variant="danger" onClick={purgeSelected} disabled={busy} className="!py-1.5">
              <Trash2 className="mr-1.5 inline h-4 w-4" />
              Xóa hẳn
            </Button>
            <button className="ml-auto text-xs text-slate-500 hover:underline" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </button>
          </div>
        )}
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {loading && <p className="py-8 text-center text-sm text-slate-500">Đang tải…</p>}

      {empty && (
        <Card className="py-12 text-center text-slate-500">
          <Trash2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {query ? "Không có câu hỏi nào khớp từ khóa." : "Thùng rác trống."}
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Chọn cả trang" />
            <span className="w-44 shrink-0">Mã ID</span>
            <span className="flex-1">Nội dung</span>
            <span className="hidden w-40 shrink-0 md:block">Ngày xóa</span>
            <span className="w-52 shrink-0 text-right">Thao tác</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const open = openId === r.raw.id;
              const preview = r.item.content.replace(/\s+/g, " ").slice(0, 140);
              return (
                <li key={r.raw.id} className={selected.has(r.raw.id) ? "bg-indigo-50/40" : ""}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.raw.id)}
                      onChange={() => toggle(r.raw.id)}
                      aria-label={`Chọn ${r.item.code}`}
                    />
                    <div className="w-44 shrink-0 space-y-1">
                      <code className="block truncate text-xs font-semibold text-slate-800" title={r.item.code}>
                        {r.raw.question_code || "(chưa có ID)"}
                      </code>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone="indigo">{r.item.type}</Badge>
                        {r.item.level && <Badge>{LEVEL_NAMES[r.item.level]}</Badge>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.raw.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-slate-600 hover:text-slate-900"
                      title="Xem / ẩn nội dung"
                    >
                      <span className="truncate">{preview || "(trống)"}</span>
                      {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    </button>
                    <span className="hidden w-40 shrink-0 text-xs text-slate-500 md:block">
                      {fmtTime(r.raw.deleted_at ?? r.raw.updated_at ?? r.raw.created_at)}
                    </span>
                    <div className="flex w-52 shrink-0 justify-end gap-2">
                      <Button onClick={() => restoreOne(r)} disabled={busy} className="!px-2.5 !py-1.5 text-xs">
                        <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
                        Phục hồi
                      </Button>
                      <Button variant="danger" onClick={() => purgeOne(r)} disabled={busy} className="!px-2.5 !py-1.5 text-xs">
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                        Xóa hẳn
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div className="border-t border-slate-100 bg-white px-6 py-4">
                      <QuestionBody question={r.item} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            ‹ Trước
          </Button>
          <span className="text-slate-600">Trang {page} / {totalPages}</span>
          <Button variant="ghost" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Sau ›
          </Button>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Câu đã được dùng trong đề thi đã sinh sẽ không thể xóa hẳn (để không làm hỏng đề); bạn vẫn có thể phục hồi chúng.
      </p>
    </div>
  );
}
