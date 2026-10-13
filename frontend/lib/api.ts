export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const TYPES = ["Trắc nghiệm nhiều lựa chọn", "Đúng - Sai", "Trả lời ngắn", "Tự luận"] as const;
export const LEVELS = ["NB", "TH", "VD", "VDC"] as const;
export const LEVEL_LABEL: Record<string, string> = {
  NB: "Nhận biết", TH: "Thông hiểu", VD: "Vận dụng", VDC: "Vận dụng cao",
};

export type Question = {
  id: string; question_code: string | null; content_latex: string;
  question_type: string; difficulty_level: string | null;
  grade_level: string | null; chapter: string | null; lesson: string | null; topic: string | null;
  extracted_answer?: string | null; extracted_solution: string | null; teacher_notes: string | null; source_material: string | null;
};

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch {
    throw new Error(`Không kết nối được máy chủ (${API}). Hãy kiểm tra backend đã chạy chưa.`);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const post = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
