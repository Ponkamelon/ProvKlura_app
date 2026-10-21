/**
 * Nutidskrysset — tio frågor om veckans nyheter med tre svarsalternativ
 * (1, X, 2), som "nutidskrysset" i skolan. Lagras i nutidskryss.entries.
 */

export const SIGNS = ["1", "X", "2"] as const;

export type NutidQuestion = {
  question: string;
  /** Exakt tre alternativ: 1, X och 2. */
  options: string[];
  /** Index för rätt alternativ: 0 = 1, 1 = X, 2 = 2. */
  correct: number;
  /** Kort förklaring som visas efter svaret. */
  explanation: string;
  subject: string;
  /** Nyheterna frågan bygger på. Tom lista för tidlösa reservkryss. */
  sources: { source: string; title: string; url: string }[];
};

export type NutidKryssRow = {
  id: string;
  week_start: string | null;
  status: "draft" | "published" | "rejected" | "failed";
  is_evergreen: boolean;
  title: string;
  entries: NutidQuestion[];
  error: string | null;
  created_at: string;
  published_at: string | null;
};

/** Det eleven får se: inga länkar till nyhetssajterna, bara källornas namn. */
export type StudentQuestion = Omit<NutidQuestion, "sources"> & { sourceNames: string[] };

export function toStudentQuestions(entries: NutidQuestion[]): StudentQuestion[] {
  return entries.map(({ sources, ...q }) => ({
    ...q,
    sourceNames: [...new Set((sources ?? []).map((s) => s.source))],
  }));
}

export function isValidQuestion(q: unknown): q is NutidQuestion {
  if (!q || typeof q !== "object") return false;
  const x = q as Partial<NutidQuestion>;
  return (
    typeof x.question === "string" &&
    Array.isArray(x.options) &&
    x.options.length === 3 &&
    x.options.every((o) => typeof o === "string" && o.length > 0) &&
    typeof x.correct === "number" &&
    x.correct >= 0 &&
    x.correct <= 2
  );
}

/** Minst sex frågor i rätt format — annars visas ett reservkryss istället. */
export function isUsableKryss(k: Pick<NutidKryssRow, "entries">): boolean {
  return Array.isArray(k.entries) && k.entries.length >= 6 && k.entries.every(isValidQuestion);
}

export const MIN_QUESTIONS = 6;
