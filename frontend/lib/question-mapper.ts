import type { Question } from "@/lib/api";
import type { DifficultyLevel, QuestionItem, QuestionType } from "@/components/question-bank/types";
import { parseExercise } from "@/lib/exam-parser";
import { levelFromCode } from "@/lib/tree";

const LEVEL_MAP: Record<string, DifficultyLevel> = { NB: 1, TH: 2, VD: 3, VDC: 4 };

export function mapBackendQuestion(q: Question, idx: number): QuestionItem {
  const t = (q.question_type ?? "").toLowerCase();
  let type: QuestionType = "Trắc nghiệm";
  if (t.includes("đúng")) type = "Đúng/Sai";
  else if (t.includes("ngắn")) type = "Trả lời ngắn";
  else if (t.includes("tự luận")) type = "Tự luận";

  const code = q.question_code || "";
  const level = (q.difficulty_level ? LEVEL_MAP[q.difficulty_level] : undefined) ?? levelFromCode(code) ?? null;

  const raw = q.content_latex || "";
  const parsed = raw ? parseExercise(raw) : null;

  return {
    id: q.id,
    number: idx + 1,
    code: code || `Q.${idx + 1}`,
    type,
    level,
    content: parsed?.stem || raw,
    raw,
    solution: q.extracted_solution ?? parsed?.solution ?? undefined,
    answer: q.extracted_answer ?? parsed?.answer ?? undefined,
  };
}
