import { daysUntil } from "@/lib/quiz/examDate";

/**
 * Provdatum styr urvalet (kravspec avsnitt 9). Intervallen är startregler.
 *  ingen     – inget kommande prov: vanlig repetition
 *  bred      – mer än 14 dagar: bred träning inom provområdet och fördelad repetition
 *  fokus     – 7–14 dagar: högre prioritet för det eleven är osäker på eller behöver träna
 *  slutspurt – 1–6 dagar: fokuserad repetition av kvarvarande luckor + blandat inom provområdet
 *  provdag   – provdagen: frivillig, kort repetition av tidigare tränat
 */
export type ExamPhase = "ingen" | "bred" | "fokus" | "slutspurt" | "provdag";

export function examPhase(examDate: string | null, today: string): ExamPhase {
  if (!examDate) return "ingen";
  const days = daysUntil(examDate, today);
  if (days < 0) return "ingen";
  if (days === 0) return "provdag";
  if (days <= 6) return "slutspurt";
  if (days <= 14) return "fokus";
  return "bred";
}

/** Provet ligger inom sju dagar: repetitionsintervallen komprimeras. */
export function compressIntervals(examDate: string | null, today: string): boolean {
  if (!examDate) return false;
  const days = daysUntil(examDate, today);
  return days >= 0 && days <= 7;
}
