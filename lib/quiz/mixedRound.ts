import { isDueForRepetition, type PointStatusRow } from "@/lib/knowledge/status";

/**
 * Blandad repetition (kravspec avsnitt 4 och 8): punkter som eleven har
 * tränat och som är aktuella att fräscha upp, från flera test. Äldst
 * först, och testen varvas så att rundan blir blandad.
 */
export const MIXED_ROUND_SIZE = 5;

export function duePoints(points: PointStatusRow[], now = Date.now()): PointStatusRow[] {
  // Samma punkt kan finnas i flera test — räkna den en gång.
  const unique = new Map<string, PointStatusRow>();
  for (const p of points) if (isDueForRepetition(p, now) && !unique.has(p.knowledge_point_id)) unique.set(p.knowledge_point_id, p);
  return [...unique.values()].sort((a, b) => (a.last_answered ?? "").localeCompare(b.last_answered ?? ""));
}

export function selectMixedRound(
  points: PointStatusRow[],
  questions: { id: string; study_set_id: string; knowledge_point_id: string | null; last_answered?: string | null }[],
  size = MIXED_ROUND_SIZE,
  now = Date.now(),
): string[] {
  const due = duePoints(points, now);
  // Varva testen: ta den äldsta punkten från varje test i tur och ordning.
  const bySet = new Map<string, PointStatusRow[]>();
  for (const p of due) bySet.set(p.study_set_id, [...(bySet.get(p.study_set_id) ?? []), p]);
  const order: PointStatusRow[] = [];
  for (let i = 0; order.length < due.length; i++) {
    let added = false;
    for (const list of bySet.values()) {
      if (list[i]) {
        order.push(list[i]);
        added = true;
      }
    }
    if (!added) break;
  }

  const chosen: string[] = [];
  for (const p of order) {
    if (chosen.length >= size) break;
    const candidates = questions
      .filter((q) => q.knowledge_point_id === p.knowledge_point_id && !chosen.includes(q.id))
      .sort((a, b) => (a.last_answered ?? "").localeCompare(b.last_answered ?? ""));
    if (candidates[0]) chosen.push(candidates[0].id);
  }
  return chosen;
}
