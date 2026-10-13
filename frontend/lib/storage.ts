export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const s = window.localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* hết dung lượng hoặc bị chặn – bỏ qua */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
