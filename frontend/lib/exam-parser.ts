/**
 * Bóc tách một khối \begin{ex}...\end{ex} (gói ex_test) thành đề bài, phương án, đáp án, lời giải.
 * Chỉ dùng để HIỂN THỊ; mã LaTeX gốc luôn được giữ nguyên trong `raw`.
 */
export type ExKind = "choice" | "tf" | "short" | "essay";

export interface ExChoice {
  label: string;
  text: string;
  correct: boolean;
}

export interface ParsedEx {
  kind: ExKind;
  stem: string;
  choices: ExChoice[];
  answer: string | null;
  solution: string | null;
  hasFigure: boolean;
}

/** Đọc nhóm {...} bắt đầu tại s[i] === "{" (có xử lý ngoặc lồng và \{ \}). */
export function readGroup(s: string, i: number): [string, number] | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

function skipWs(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

function skipOptional(s: string, i: number): number {
  const j = skipWs(s, i);
  if (s[j] === "[") {
    const k = s.indexOf("]", j);
    if (k > 0) return k + 1;
  }
  return i;
}

export function findCommand(s: string, name: string, from = 0): number {
  const re = new RegExp("\\\\" + name + "(?![a-zA-Z])", "g");
  re.lastIndex = from;
  const m = re.exec(s);
  return m ? m.index : -1;
}

function stripComments(s: string): string {
  return s.replace(/(^|[^\\])%.*$/gm, "$1");
}

function cleanTex(input: string): { text: string; figure: boolean } {
  let figure = false;
  let t = input;

  t = t.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, () => {
    figure = true;
    return "\n\n\\textit{[Hình vẽ TikZ – xem mã LaTeX]}\n\n";
  });
  t = t.replace(/\\includegraphics(\[[^\]]*\])?\{[^}]*\}/g, () => {
    figure = true;
    return "\\textit{[Hình ảnh]}";
  });

  // \immini[opt]{văn bản}{hình}
  for (let guard = 0; guard < 20; guard++) {
    const idx = findCommand(t, "immini");
    if (idx < 0) break;
    const p = skipOptional(t, idx + "\\immini".length);
    const g1 = readGroup(t, skipWs(t, p));
    if (!g1) break;
    const g2 = readGroup(t, skipWs(t, g1[1]));
    const end = g2 ? g2[1] : g1[1];
    if (g2) figure = true;
    t = t.slice(0, idx) + g1[0] + (g2 ? "\n\n\\textit{[Hình vẽ – xem mã LaTeX]}" : "") + t.slice(end);
  }

  t = t
    .replace(/\\begin\{(itemize|enumerate)\}(\[[^\]]*\])?/g, "\n\n")
    .replace(/\\end\{(itemize|enumerate)\}/g, "\n\n")
    .replace(/\\item(?![a-zA-Z])\s*/g, "\n\n• ")
    .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, "")
    .replace(/\\(?:noindent|centering|medskip|bigskip|smallskip)(?![a-zA-Z])/g, "");

  return { text: t.trim(), figure };
}

export function parseExercise(raw: string): ParsedEx {
  let body = stripComments(raw).trim();
  body = body
    .replace(/^\\begin\{ex\}\s*(\[[^\]]*\])?/, "")
    .replace(/\\end\{ex\}\s*$/, "")
    .trim();

  let solution: string | null = null;
  const li = findCommand(body, "loigiai");
  if (li >= 0) {
    const g = readGroup(body, skipWs(body, li + "\\loigiai".length));
    if (g) {
      solution = g[0].trim();
      body = (body.slice(0, li) + body.slice(g[1])).trim();
    }
  }

  let kind: ExKind = "essay";
  let stemEnd = body.length;
  let choices: ExChoice[] = [];
  let answer: string | null = null;

  const tf = findCommand(body, "choiceTF");
  const mc = tf < 0 ? findCommand(body, "choice") : -1;
  const sa = findCommand(body, "shortans");

  if (tf >= 0 || mc >= 0) {
    const at = tf >= 0 ? tf : mc;
    kind = tf >= 0 ? "tf" : "choice";
    let p = skipOptional(body, at + (tf >= 0 ? "\\choiceTF".length : "\\choice".length));
    const groups: string[] = [];
    for (let k = 0; k < 4; k++) {
      p = skipWs(body, p);
      const g = readGroup(body, p);
      if (!g) break;
      groups.push(g[0]);
      p = g[1];
    }
    stemEnd = at;
    choices = groups.map((g, i) => ({
      label: kind === "tf" ? "abcd"[i] : "ABCD"[i],
      text: g.replace(/\\True(?![a-zA-Z])\s*/g, "").trim(),
      correct: /\\True(?![a-zA-Z])/.test(g),
    }));
  } else if (sa >= 0) {
    kind = "short";
    const p = skipOptional(body, sa + "\\shortans".length);
    const g = readGroup(body, skipWs(body, p));
    answer = g ? g[0].trim() : null;
    stemEnd = sa;
  }

  let hasFigure = false;
  const clean = (s: string): string => {
    const r = cleanTex(s);
    hasFigure = hasFigure || r.figure;
    return r.text;
  };

  return {
    kind,
    stem: clean(body.slice(0, stemEnd)),
    choices: choices.map((c) => ({ ...c, text: clean(c.text) })),
    answer: answer ? clean(answer) : null,
    solution: solution ? clean(solution) : null,
    hasFigure,
  };
}

/** Bỏ \loigiai{...} khỏi mã LaTeX gốc (để xuất đề không kèm lời giải). */
export function stripSolution(raw: string): string {
  const li = findCommand(raw, "loigiai");
  if (li < 0) return raw;
  const g = readGroup(raw, skipWs(raw, li + "\\loigiai".length));
  if (!g) return raw;
  return (raw.slice(0, li).replace(/[ \t]+$/, "") + raw.slice(g[1])).replace(/\n{3,}/g, "\n\n");
}
