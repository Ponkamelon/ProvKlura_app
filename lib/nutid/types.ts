import type { CrosswordLayout } from "@/lib/nutid/layout";

/** Ett ord i Nutidskrysset (lagras i nutidskryss.entries). */
export type NutidEntry = {
  answer: string;
  clue: string;
  concept: string;
  subject: string;
  /** Nyheterna ordet bygger på. Tom lista för tidlösa reservkryss. */
  sources: { source: string; title: string; url: string }[];
};

export type NutidKryssRow = {
  id: string;
  week_start: string | null;
  status: "draft" | "published" | "rejected" | "failed";
  is_evergreen: boolean;
  title: string;
  entries: NutidEntry[];
  layout: CrosswordLayout | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
};

/** Det eleven får se: inga länkar till nyhetssajterna, bara källornas namn. */
export type StudentEntry = {
  answer: string;
  clue: string;
  concept: string;
  subject: string;
  sourceNames: string[];
};

export function toStudentEntries(entries: NutidEntry[]): StudentEntry[] {
  return entries.map((e) => ({
    answer: e.answer,
    clue: e.clue,
    concept: e.concept,
    subject: e.subject,
    sourceNames: [...new Set((e.sources ?? []).map((s) => s.source))],
  }));
}

export function isUsableKryss(k: Pick<NutidKryssRow, "entries" | "layout">): boolean {
  return Array.isArray(k.entries) && k.entries.length > 0 && !!k.layout && Array.isArray(k.layout.placements);
}
