import type { DupKind, DupMatch } from "@/components/question-bank/types";

export const DUP_LABEL: Record<DupKind, string> = {
  exact: "Gần như trùng hoàn toàn",
  similar: "Tương tự, cần xem",
  diff_data: "Giống nhưng khác số liệu",
};

/** Nhãn ngắn hiển thị trên thẻ câu hỏi. */
export function dupShortLabel(m: DupMatch): string {
  const pct = Math.round(m.similarity * 100);
  return m.kind === "exact" ? `Trùng ${pct}%` : m.kind === "similar" ? `Giống ${pct}%` : `Khác số liệu ${pct}%`;
}

export const DUP_BADGE_CLASS: Record<DupKind, string> = {
  exact: "bg-red-100 text-red-700",
  similar: "bg-amber-100 text-amber-800",
  diff_data: "bg-sky-100 text-sky-700",
};

const SEVERITY: Record<DupKind, number> = { exact: 3, similar: 2, diff_data: 1 };

/** exact / similar = nghi trùng thật (bị bỏ qua khi duyệt hàng loạt); diff_data chỉ là nhãn thông tin. */
export const isBlockingKind = (k: DupKind) => k === "exact" || k === "similar";

export const hasBlocking = (ms?: DupMatch[]) => !!ms?.some((m) => isBlockingKind(m.kind));

export function worstMatch(ms?: DupMatch[]): DupMatch | undefined {
  if (!ms || ms.length === 0) return undefined;
  return ms.reduce((a, b) => (SEVERITY[b.kind] > SEVERITY[a.kind] || (b.kind === a.kind && b.similarity > a.similarity) ? b : a));
}

export interface DiffSeg {
  text: string;
  changed: boolean;
}

const MAX_TOKENS = 900;

/** So sánh hai đoạn mã theo từ (LCS) để tô đoạn khác nhau. Quá dài thì không tô (trả null). */
export function diffTokens(a: string, b: string): { left: DiffSeg[]; right: DiffSeg[] } | null {
  const clean = (s: string) => s.replace(/%\[[^\]]*\]/g, "").trim();
  const ta = clean(a).split(/\s+/).filter(Boolean);
  const tb = clean(b).split(/\s+/).filter(Boolean);
  if (ta.length > MAX_TOKENS || tb.length > MAX_TOKENS) return null;

  const n = ta.length;
  const m = tb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const left: DiffSeg[] = [];
  const right: DiffSeg[] = [];
  const push = (arr: DiffSeg[], text: string, changed: boolean) => {
    const last = arr[arr.length - 1];
    if (last && last.changed === changed) last.text += " " + text;
    else arr.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) {
      push(left, ta[i], false);
      push(right, tb[j], false);
      i++;
      j++;
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) {
      push(left, ta[i++], true);
    } else {
      push(right, tb[j++], true);
    }
  }
  return { left, right };
}
