import { shuffle } from "@/lib/quiz/selection";
import { isDueForRepetition, type PointStatusRow } from "@/lib/knowledge/status";

/**
 * Kort runda (kravspec avsnitt 5): fem frågor inom testet enligt 2+2+1.
 *  - 2 frågor om punkter eleven behöver träna
 *  - 2 frågor som är aktuella för repetition
 *  - 1 fråga som befäster något eleven redan klarat
 * Saknas underlag fylls rundan på (otränat först). En helt ny elev får en
 * introduktionsrunda med punkter från olika områden. Högst två frågor får
 * vara samma som i förra rundan i samma test, när poolen räcker.
 */

export type RoundQuestion = { id: string; knowledge_point_id: string | null; last_answered?: string | null };

export const SHORT_ROUND_SIZE = 5;
const MAX_REPEAT_FROM_LAST_ROUND = 2;

type Slot = "behover_trana" | "repetition" | "befasta";

export function selectShortRound(
  questions: RoundQuestion[],
  points: PointStatusRow[],
  previousRound: string[],
  size = SHORT_ROUND_SIZE,
  now = Date.now(),
): string[] {
  if (questions.length <= size) return shuffle(questions.map((q) => q.id));

  const statusByPoint = new Map(points.map((p) => [p.knowledge_point_id, p]));
  const previous = new Set(previousRound);
  const byPoint = new Map<string, RoundQuestion[]>();
  for (const q of questions) {
    const key = q.knowledge_point_id ?? `fraga:${q.id}`;
    byPoint.set(key, [...(byPoint.get(key) ?? []), q]);
  }

  // Frågan inom en punkt: inte i förra rundan, helst den som besvarats längst sedan.
  const pickFromPoint = (pointKey: string, taken: Set<string>): string | null => {
    const candidates = (byPoint.get(pointKey) ?? []).filter((q) => !taken.has(q.id));
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) => {
      const prevDiff = Number(previous.has(a.id)) - Number(previous.has(b.id));
      if (prevDiff) return prevDiff;
      return (a.last_answered ?? "").localeCompare(b.last_answered ?? "");
    });
    return sorted[0].id;
  };

  const pointsWith = (filter: (p: PointStatusRow) => boolean) =>
    [...byPoint.keys()].filter((key) => {
      const p = statusByPoint.get(key);
      return p ? filter(p) : false;
    });

  const oldestFirst = (keys: string[]) =>
    keys.sort((a, b) => (statusByPoint.get(a)?.last_answered ?? "").localeCompare(statusByPoint.get(b)?.last_answered ?? ""));

  const buckets: Record<Slot, string[]> = {
    behover_trana: shuffle(pointsWith((p) => p.status === "behover_trana")),
    repetition: oldestFirst(pointsWith((p) => p.status !== "behover_trana" && isDueForRepetition(p, now))),
    befasta: shuffle(pointsWith((p) => p.status === "kan")),
  };
  const untrained = shuffle([...byPoint.keys()].filter((k) => (statusByPoint.get(k)?.status ?? "inte_tranat") === "inte_tranat"));
  const isNewStudent = points.every((p) => p.status === "inte_tranat");

  const chosen: string[] = [];
  const takenQuestions = new Set<string>();
  const usedPoints = new Set<string>();

  const takeFrom = (keys: string[], count: number) => {
    for (const key of keys) {
      if (chosen.length >= size || count <= 0) break;
      if (usedPoints.has(key)) continue;
      const id = pickFromPoint(key, takenQuestions);
      if (!id) continue;
      chosen.push(id);
      takenQuestions.add(id);
      usedPoints.add(key);
      count--;
    }
  };

  if (isNewStudent) {
    // Introduktionsrunda: sprid över områden så eleven möter testets bredd.
    const byArea = new Map<string, string[]>();
    for (const key of untrained) {
      const area = statusByPoint.get(key)?.area ?? "";
      byArea.set(area, [...(byArea.get(area) ?? []), key]);
    }
    const spread: string[] = [];
    for (let round = 0; spread.length < untrained.length; round++) {
      let added = false;
      for (const keys of byArea.values()) {
        if (keys[round]) {
          spread.push(keys[round]);
          added = true;
        }
      }
      if (!added) break;
    }
    takeFrom(spread, size);
  } else {
    takeFrom(buckets.behover_trana, 2);
    takeFrom(buckets.repetition, 2);
    takeFrom(buckets.befasta, 1);
    // Fyll på när underlag saknas: otränat, sedan det som är kvar i varje grupp.
    takeFrom(untrained, size - chosen.length);
    takeFrom([...buckets.behover_trana, ...buckets.repetition, ...buckets.befasta], size - chosen.length);
    takeFrom(shuffle([...byPoint.keys()]), size - chosen.length);
  }

  // Sista utfyllnad om testet har få punkter: fler frågor från samma punkter.
  for (const q of shuffle(questions)) {
    if (chosen.length >= size) break;
    if (!takenQuestions.has(q.id) && !previous.has(q.id)) {
      chosen.push(q.id);
      takenQuestions.add(q.id);
    }
  }
  for (const q of shuffle(questions)) {
    if (chosen.length >= size) break;
    if (!takenQuestions.has(q.id)) {
      chosen.push(q.id);
      takenQuestions.add(q.id);
    }
  }

  // Högst två frågor gemensamma med förra rundan, när poolen räcker.
  const repeats = chosen.filter((id) => previous.has(id));
  if (repeats.length > MAX_REPEAT_FROM_LAST_ROUND) {
    const fresh = shuffle(questions.filter((q) => !takenQuestions.has(q.id) && !previous.has(q.id)));
    for (const id of repeats.slice(MAX_REPEAT_FROM_LAST_ROUND)) {
      const replacement = fresh.shift();
      if (!replacement) break;
      chosen[chosen.indexOf(id)] = replacement.id;
    }
  }

  return shuffle(chosen);
}
