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
  let t = esc(s);
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

export function renderLatex(content: string): string {
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

export const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = "" }) => {
  const html = useMemo(() => (content ? renderLatex(content) : ""), [content]);
  return (
    <div
      className={`latex-content leading-relaxed text-slate-800 text-[13.5px] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
