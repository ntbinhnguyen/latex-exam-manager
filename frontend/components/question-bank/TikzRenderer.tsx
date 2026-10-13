"use client";

import React, { useEffect, useState } from "react";

/** Địa chỉ FastAPI – chỉnh cho khớp với cách app đang gọi backend. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Khối tikzpicture, kèm \begin{center}…\end{center} bao quanh (nếu có). */
const TIKZ_RE =
  /(?:\\begin\{center\}\s*)?(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})(?:\s*\\end\{center\})?/g;

export type Segment = { type: "text"; value: string } | { type: "tikz"; value: string };

/**
 * Tách nội dung thành các đoạn văn bản và các khối TikZ (theo đúng thứ tự).
 * Dùng trong QuestionBody để chèn hình đúng vị trí và không để lại \begin{center} / \end{center}.
 */
export function splitTikz(src: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of src.matchAll(TIKZ_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: src.slice(last, start) });
    out.push({ type: "tikz", value: m[1] });
    last = start + m[0].length;
  }
  if (last < src.length) out.push({ type: "text", value: src.slice(last) });
  return out;
}

// Cache theo mã TikZ: cùng một hình chỉ biên dịch một lần trong phiên làm việc.
const cache = new Map<string, Promise<string>>();

function fetchSvg(code: string): Promise<string> {
  let p = cache.get(code);
  if (!p) {
    p = fetch(`${API_BASE}/api/tikz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(typeof data?.detail === "string" ? data.detail : `Lỗi máy chủ (${res.status})`);
      }
      return res.text();
    });
    p.catch(() => cache.delete(code)); // lỗi thì cho phép thử lại
    cache.set(code, p);
  }
  return p;
}

type State =
  | { status: "loading" }
  | { status: "ok"; src: string }
  | { status: "error"; message: string };

/** Một hình TikZ → ảnh SVG. */
export const TikzFigure: React.FC<{ code: string; debounceMs?: number }> = ({ code, debounceMs = 500 }) => {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState((s) => (s.status === "ok" ? s : { status: "loading" })); // giữ hình cũ khi đang gõ lại
    // debounce: ô "Sửa nội dung" xem trước theo từng phím gõ, tránh biên dịch liên tục
    const timer = setTimeout(() => {
      fetchSvg(code)
        .then((svg) => {
          if (!alive) return;
          setState({ status: "ok", src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
        })
        .catch((e) => {
          if (!alive) return;
          setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
        });
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [code, debounceMs]);

  if (state.status === "error") {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
        <div className="font-semibold">Không dựng được hình TikZ</div>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{state.message}</pre>
      </div>
    );
  }

  return (
    <div className="my-3 flex justify-center overflow-auto rounded bg-white p-2">
      {state.status === "loading" ? (
        <span className="text-xs italic text-gray-500">Đang dựng hình…</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.src} alt="Hình vẽ TikZ" className="h-auto max-w-full" />
      )}
    </div>
  );
};

interface Props {
  latexContent: string;
}

/** Giữ nguyên giao diện cũ: truyền cả đoạn LaTeX, vẽ tất cả khối tikzpicture tìm thấy. */
export const TikzRenderer: React.FC<Props> = ({ latexContent }) => {
  const blocks = splitTikz(latexContent).filter((s) => s.type === "tikz");
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {blocks.map((b, i) => (
        <TikzFigure key={i} code={b.value} />
      ))}
    </div>
  );
};