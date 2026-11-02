"use client";

import React, { useMemo } from "react";
import katex from "katex";

interface LatexRendererProps {
  content: string;
  className?: string;
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$]+?)\$/g;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textToHtml(s: string): string {
  let t = esc(s).replace(/\\(?:renewcommand|newcommand)\s*\{[^{}]*\}(?:\[\d\])?\s*\{[^{}]*\}/g, "");
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\\textbf\{([^{}]*)\}/g, "<strong>$1</strong>")
      .replace(/\\(?:textit|emph)\{([^{}]*)\}/g, "<em>$1</em>")
      .replace(/\\underline\{([^{}]*)\}/g, "<u>$1</u>");
  }
  return t
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\\\\/g, "<br/>")
    .replace(/\\%/g, "%")
    .replace(/\\&amp;/g, "&amp;")
    .replace(/\n{2,}/g, "\u0000")
    .replace(/\n/g, " ")
    .replace(/\u0000/g, "<br/><br/>");
}

function math(src: string, display: boolean): string {
  try {
    const html = katex.renderToString(src.trim(), { displayMode: display, throwOnError: false });
    return display ? `<div class="my-1.5 overflow-x-auto py-1 text-center">${html}</div>` : html;
  } catch {
    return `<span class="text-red-500 font-mono text-xs">${esc(src)}</span>`;
  }
}

function renderInline(content: string): string {
  let out = "";
  let last = 0;
  for (const m of content.matchAll(MATH_RE)) {
    const idx = m.index ?? 0;
    out += textToHtml(content.slice(last, idx));
    if (m[1] !== undefined) out += math(m[1], true);
    else if (m[2] !== undefined) out += math(m[2], true);
    else if (m[3] !== undefined) out += math(m[3], false);
    else out += math(m[4] ?? "", false);
    last = idx + m[0].length;
  }
  out += textToHtml(content.slice(last));
  return out;
}

/* ---------- Môi trường center & tabular ---------- */

const CENTER_RE = /\\begin\{center\}([\s\S]*?)\\end\{center\}/g;
// \begin{tabular}[pos]{spec} ... \end{tabular}  (spec cho phép lồng {} tối đa 2 cấp, vd. p{3cm}, @{}, *{3}{c})
const TABULAR_RE =
  /\\begin\{tabular\}(?:\[[a-z]\])?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}([\s\S]*?)\\end\{tabular\}/g;
const STRETCH_RE = /\\renewcommand\s*\{\\arraystretch\}\s*\{([\d.]+)\}/g;
const CSS_LEN_RE = /^[\d.]+(?:cm|mm|pt|em|ex|in)$/;

interface ColSpec {
  align: "left" | "center" | "right";
  left: number; // số gạch dọc "|" ngay trước cột
  right: number; // số gạch dọc "|" sau cột (chỉ cột cuối)
  width?: string;
}

function parseColSpec(spec: string): ColSpec[] {
  let s = spec.replace(/\*\{(\d+)\}\{([^{}]*)\}/g, (_, n: string, inner: string) => inner.repeat(Number(n)));
  s = s.replace(/[@!<>]\{[^{}]*\}/g, "");
  const cols: ColSpec[] = [];
  let bars = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "|") {
      bars++;
    } else if (ch === "l" || ch === "c" || ch === "r") {
      cols.push({ align: ch === "l" ? "left" : ch === "r" ? "right" : "center", left: bars, right: 0 });
      bars = 0;
    } else if ((ch === "p" || ch === "m" || ch === "b") && s[i + 1] === "{") {
      const end = s.indexOf("}", i + 2);
      if (end < 0) break;
      const w = s.slice(i + 2, end).trim();
      cols.push({ align: "left", left: bars, right: 0, width: CSS_LEN_RE.test(w) ? w : undefined });
      bars = 0;
      i = end;
    }
  }
  if (cols.length) cols[cols.length - 1].right = bars;
  return cols;
}

const vBorder = (n: number) => (n >= 2 ? "3px double currentColor" : "1px solid currentColor");

/** Tách thân tabular thành các hàng/ô, bỏ qua & và \\ nằm trong {} hoặc $...$ */
function splitRows(body: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let depth = 0;
  let inMath = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") {
      const n = body[i + 1];
      if (n === "\\" && depth === 0 && !inMath) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        i++;
        const opt = body.slice(i + 1).match(/^\s*\[\s*-?[\d.]+\s*(?:pt|mm|cm|em|ex|in)\s*\]/); // \\[2pt]
        if (opt) i += opt[0].length;
      } else {
        cell += ch + (n ?? "");
        i++;
      }
    } else if (ch === "&" && depth === 0 && !inMath) {
      row.push(cell);
      cell = "";
    } else {
      if (ch === "$") inMath = !inMath;
      else if (!inMath && ch === "{") depth++;
      else if (!inMath && ch === "}") depth = Math.max(0, depth - 1);
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function readBalanced(s: string, start: number): [string, number] | null {
  if (s[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return [s.slice(start + 1, i), i + 1];
  }
  return null;
}

/** Nội dung 1 ô: \hspace{..} -> khoảng trống thật (giữ độ rộng ô cần điền), phần còn lại render như văn bản/toán. */
function renderCellContent(raw: string): string {
  const text = raw
    .replace(/\\vspace\*?\{[^{}]*\}/g, "")
    .replace(/\\(?:noindent|centering|strut)(?![a-zA-Z])/g, "")
    .trim();
  if (!text) return "&nbsp;";
  const parts = text.split(/\\hspace\*?\{([^{}]*)\}/);
  let out = "";
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const w = part.trim();
      if (CSS_LEN_RE.test(w)) out += `<span style="display:inline-block;width:${w}"></span>`;
    } else if (part.trim()) {
      out += renderInline(part.trim());
    }
  });
  return out || "&nbsp;";
}

const LINE_RE = /^\s*(?:\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\s*\{[^{}]*\})/;

function renderTable(spec: string, body: string, centered: boolean, stretch: number): string {
  const cols = parseColSpec(spec);
  const rawRows = splitRows(body);

  interface Row { cells: string[]; top: number; clines: Array<[number, number]>; bottom: number }
  const rows: Row[] = [];
  for (const cells of rawRows) {
    let first = cells[0] ?? "";
    let top = 0;
    const clines: Array<[number, number]> = [];
    for (let m = first.match(LINE_RE); m; m = first.match(LINE_RE)) {
      const tok = m[0].trim();
      const c = tok.match(/\\cline\s*\{\s*(\d+)\s*-\s*(\d+)\s*\}/);
      if (c) clines.push([Number(c[1]), Number(c[2])]);
      else top++;
      first = first.slice(m[0].length);
    }
    const rest = [first, ...cells.slice(1)];
    const onlyLines = rest.length === 1 && rest[0].trim() === "";
    if (onlyLines) {
      // hàng "rỗng" chỉ chứa \hline (sau \\ cuối cùng) -> kẻ đường dưới hàng trước
      if (rows.length) rows[rows.length - 1].bottom += top;
      continue;
    }
    rows.push({ cells: rest, top, clines, bottom: 0 });
  }

  const padY = (0.3 * stretch).toFixed(2);
  const trs = rows.map((r) => {
    let c = 1; // chỉ số cột (1-based), có tính colspan
    const tds = r.cells.map((raw) => {
      let text = raw;
      let span = 1;
      let spec1: ColSpec | undefined = cols[c - 1];
      let useOwnBars = false;

      const mc = raw.trim().match(/^\\multicolumn\s*\{(\d+)\}\s*\{([^{}]*)\}\s*/);
      if (mc) {
        const t = raw.trim();
        const g = readBalanced(t, mc[0].length);
        if (g) {
          span = Math.max(1, Number(mc[1]));
          const own = parseColSpec(mc[2])[0];
          if (own) {
            spec1 = own;
            useOwnBars = true;
          }
          text = g[0];
        }
      }

      const startCol = c;
      c += span;
      const align = spec1?.align ?? "center";
      const styles = [`padding:${padY}em .7em`, `text-align:${align}`, "vertical-align:middle"];
      if (spec1?.width) styles.push(`width:${spec1.width}`);
      if (spec1 && spec1.left > 0) styles.push(`border-left:${vBorder(spec1.left)}`);
      const lastSpec = useOwnBars ? spec1 : cols[startCol + span - 2];
      if (lastSpec && lastSpec.right > 0) styles.push(`border-right:${vBorder(lastSpec.right)}`);
      const hasCline = r.clines.some(([a, b]) => startCol >= a && startCol + span - 1 <= b);
      if (r.top > 0 || hasCline) styles.push(`border-top:${vBorder(r.top >= 2 ? 2 : 1)}`);
      if (r.bottom > 0) styles.push(`border-bottom:${vBorder(r.bottom >= 2 ? 2 : 1)}`);
      return `<td${span > 1 ? ` colspan="${span}"` : ""} style="${styles.join(";")}">${renderCellContent(text)}</td>`;
    });
    return `<tr>${tds.join("")}</tr>`;
  });

  return (
    `<div class="my-1.5 overflow-x-auto">` +
    `<table style="border-collapse:collapse;margin:${centered ? "0 auto" : "0"}"><tbody>${trs.join("")}</tbody></table>` +
    `</div>`
  );
}

function renderTables(seg: string, centered: boolean): string {
  let out = "";
  let last = 0;
  let stretch = 1;
  const take = (t: string) =>
    t.replace(STRETCH_RE, (_, v: string) => {
      stretch = parseFloat(v) || 1;
      return "";
    });
  const text = (t: string) => {
    const x = take(t);
    return x.trim() ? renderInline(x) : "";
  };
  for (const m of seg.matchAll(TABULAR_RE)) {
    const idx = m.index ?? 0;
    out += text(seg.slice(last, idx));
    out += renderTable(m[1], m[2], centered, stretch);
    last = idx + m[0].length;
  }
  out += text(seg.slice(last));
  return out;
}

function renderBlocks(content: string, centered: boolean): string {
  let out = "";
  let last = 0;
  for (const m of content.matchAll(CENTER_RE)) {
    const idx = m.index ?? 0;
    out += renderTables(content.slice(last, idx), centered);
    out += `<div style="text-align:center">${renderBlocks(m[1], true)}</div>`;
    last = idx + m[0].length;
  }
  out += renderTables(content.slice(last), centered);
  return out;
}

export function renderLatex(content: string): string {
  return renderBlocks(content, false);
}

export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = "" }) => {
  const html = useMemo(() => (content ? renderLatex(content) : ""), [content]);
  return (
    <div
      className={`latex-content leading-relaxed text-slate-800 text-[13.5px] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};