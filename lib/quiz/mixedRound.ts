import { isDueForRepetition, type PointStatusRow } from "@/lib/knowledge/status";

/**
 * Blandad repetition (kravspec avsnitt 4 och 8): punkter som eleven har
 * tränat och som är aktuella att fräscha upp, från flera test. Med steg 2
 * avgör repetitionsschemat, punkter i ett provområde med prov inom sju
 * dagar kommer först (och deras intervall komprimeras). Testen varvas så
 * att rundan blir blandad. Kön visas aldrig som en växande skuld: rundan
 * är alltid högst fem frågor.
 */
export const MIXED_ROUND_SIZE = 5;

export type MixedOptions = {
  schedule?: boolean;
  /** Test med prov inom sju dagar → provområde (null = hela testet). */
  examSoon?: Map<string, string[] | null>;
};

function inExamSoon(p: PointStatusRow, examSoon?: Map<string, string[] | null>): boolean {
  if (!examSoon?.has(p.study_set_id)) return false;
  const areas = examSoon.get(p.study_set_id);
  return !areas || areas.includes(p.area);
}

export function duePoints(points: PointStatusRow[], now = Date.now(), options: MixedOptions = {}): PointStatusRow[] {
  // Samma punkt kan finnas i flera test — räkna den en gång (och hellre i ett test med prov snart).
  const unique = new Map<string, PointStatusRow>();
  for (const p of points) {
    const soon = inExamSoon(p, options.examSoon);
    if (!isDueForRepetition(p, now, { schedule: options.schedule, compress: soon })) continue;
    const existing = unique.get(p.knowledge_point_id);
    if (!existing || (soon && !inExamSoon(existing, options.examSoon))) unique.set(p.knowledge_point_id, p);
  }
  return [...unique.values()].sort((a, b) => {
    const soonDiff = Number(inExamSoon(b, options.examSoon)) - Number(inExamSoon(a, options.examSoon));
    if (soonDiff) return soonDiff;
    return (a.last_answered ?? "").localeCompare(b.last_answered ?? "");
  });
}

type Candidate = { id: string; study_set_id: string; knowledge_point_id: string | null; last_answered?: string | null };

function pickQuestions(order: PointStatusRow[], questions: Candidate[], size: number): string[] {
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

/** Varvar testen: tar punkter från varje test i tur och ordning, i given prioritetsordning. */
function interleaveBySet(list: PointStatusRow[]): PointStatusRow[] {
  const bySet = new Map<string, PointStatusRow[]>();
  for (const p of list) bySet.set(p.study_set_id, [...(bySet.get(p.study_set_id) ?? []), p]);
  const order: PointStatusRow[] = [];
  for (let i = 0; order.length < list.length; i++) {
    let added = false;
    for (const group of bySet.values()) {
      if (group[i]) {
        order.push(group[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return order;
}

export function selectMixedRound(
  points: PointStatusRow[],
  questions: Candidate[],
  size = MIXED_ROUND_SIZE,
  now = Date.now(),
  options: MixedOptions = {},
): string[] {
  const due = duePoints(points, now, options);
  // Punkter med prov snart först, sedan varvat mellan testen.
  const soon = due.filter((p) => inExamSoon(p, options.examSoon));
  const rest = due.filter((p) => !inExamSoon(p, options.examSoon));
  return pickQuestions([...interleaveBySet(soon), ...interleaveBySet(rest)], questions, size);
}

/**
 * Återstartsrunda (kravspec avsnitt 8): efter en längre paus en kort runda
 * med sådant eleven redan tränat — helst sådant hen klarat — så att
 * omstarten känns lätt. Ingen kö, ingen skuld.
 */
export const RESTART_AFTER_DAYS = 10;

export function selectRestartRound(points: PointStatusRow[], questions: Candidate[], size = MIXED_ROUND_SIZE): string[] {
  const unique = new Map<string, PointStatusRow>();
  for (const p of points) if (p.status !== "inte_tranat" && !unique.has(p.knowledge_point_id)) unique.set(p.knowledge_point_id, p);
  const rank = { kan: 0, osaker: 1, behover_trana: 2, inte_tranat: 3 } as const;
  const ordered = [...unique.values()].sort((a, b) => {
    const r = rank[a.status] - rank[b.status];
    if (r) return r;
    return (b.last_answered ?? "").localeCompare(a.last_answered ?? "");
  });
  return pickQuestions(interleaveBySet(ordered), questions, size);
}
