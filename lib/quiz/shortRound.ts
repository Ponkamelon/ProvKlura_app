import { shuffle } from "@/lib/quiz/selection";
import { isDueForRepetition, type PointStatusRow } from "@/lib/knowledge/status";
import type { ExamPhase } from "@/lib/quiz/examPhase";

/**
 * Kort runda (kravspec avsnitt 5 och 9): fem frågor inom testet.
 *
 * Utan kommande prov gäller 2+2+1:
 *  - 2 frågor om punkter eleven behöver träna
 *  - 2 frågor som är aktuella för repetition
 *  - 1 fråga som befäster något eleven redan klarat
 * Med provdatum (steg 2) ändras fördelningen efter tiden kvar, och bara
 * provområdet används när föräldern angett det. Saknas underlag fylls
 * rundan på. En helt ny elev får en introduktionsrunda med punkter från
 * olika områden. Högst två frågor får vara samma som i förra rundan.
 */

export type RoundQuestion = { id: string; knowledge_point_id: string | null; last_answered?: string | null };

export const SHORT_ROUND_SIZE = 5;
const MAX_REPEAT_FROM_LAST_ROUND = 2;

export type ShortRoundOptions = {
  phase?: ExamPhase;
  /** Provområdet (knowledge_points.area). null = hela testet. */
  examAreas?: string[] | null;
  /** Använd repetitionsschemat (steg 2). */
  schedule?: boolean;
  /** Provet inom 7 dagar: intervallen komprimeras. */
  compress?: boolean;
};

type Bucket = "behover" | "osaker" | "svaga" | "luckor" | "due" | "kan" | "otranat" | "tranat" | "alla";

/** Fördelning per fas: [grupp, antal]. Därefter utfyllnad i angiven ordning. */
const PLANS: Record<ExamPhase, { slots: [Bucket, number][]; fill: Bucket[] }> = {
  ingen: { slots: [["behover", 2], ["due", 2], ["kan", 1]], fill: ["otranat", "behover", "due", "kan", "alla"] },
  bred: { slots: [["behover", 1], ["due", 2], ["otranat", 2]], fill: ["otranat", "osaker", "behover", "due", "kan", "alla"] },
  fokus: { slots: [["svaga", 3], ["due", 1], ["kan", 1]], fill: ["svaga", "otranat", "due", "kan", "alla"] },
  slutspurt: { slots: [["luckor", 3], ["alla", 2]], fill: ["luckor", "alla"] },
  provdag: { slots: [["tranat", SHORT_ROUND_SIZE]], fill: [] },
};

export function selectShortRound(
  questions: RoundQuestion[],
  points: PointStatusRow[],
  previousRound: string[],
  size = SHORT_ROUND_SIZE,
  now = Date.now(),
  options: ShortRoundOptions = {},
): string[] {
  const statusByPoint = new Map(points.map((p) => [p.knowledge_point_id, p]));

  // Provområdet: bara frågor vars punkt ligger i något av områdena — om det räcker till en runda.
  let pool = questions;
  if (options.examAreas?.length && options.phase && options.phase !== "ingen") {
    const areas = new Set(options.examAreas);
    const inArea = questions.filter((q) => {
      const area = q.knowledge_point_id ? statusByPoint.get(q.knowledge_point_id)?.area : undefined;
      return !!area && areas.has(area);
    });
    if (inArea.length >= Math.min(size, questions.length)) pool = inArea;
  }

  if (pool.length <= size && options.phase !== "provdag") return shuffle(pool.map((q) => q.id));

  const previous = new Set(previousRound);
  const byPoint = new Map<string, RoundQuestion[]>();
  for (const q of pool) {
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

  const keys = [...byPoint.keys()];
  const statusOf = (key: string) => statusByPoint.get(key)?.status ?? "inte_tranat";
  const pointsWith = (filter: (status: string, p?: PointStatusRow) => boolean) =>
    keys.filter((key) => filter(statusOf(key), statusByPoint.get(key)));
  const oldestFirst = (list: string[]) =>
    list.sort((a, b) => (statusByPoint.get(a)?.last_answered ?? "").localeCompare(statusByPoint.get(b)?.last_answered ?? ""));

  // Otränat sprids över områden, så eleven möter testets bredd.
  const spreadByArea = (list: string[]) => {
    const byArea = new Map<string, string[]>();
    for (const key of shuffle(list)) {
      const area = statusByPoint.get(key)?.area ?? "";
      byArea.set(area, [...(byArea.get(area) ?? []), key]);
    }
    const spread: string[] = [];
    for (let i = 0; spread.length < list.length; i++) {
      let added = false;
      for (const group of byArea.values()) {
        if (group[i]) {
          spread.push(group[i]);
          added = true;
        }
      }
      if (!added) break;
    }
    return spread;
  };

  const dueOptions = { schedule: options.schedule, compress: options.compress };
  const buckets: Record<Bucket, string[]> = {
    behover: shuffle(pointsWith((s) => s === "behover_trana")),
    osaker: shuffle(pointsWith((s) => s === "osaker")),
    svaga: [...shuffle(pointsWith((s) => s === "behover_trana")), ...shuffle(pointsWith((s) => s === "osaker"))],
    luckor: [
      ...shuffle(pointsWith((s) => s === "behover_trana")),
      ...shuffle(pointsWith((s) => s === "osaker")),
      ...spreadByArea(pointsWith((s) => s === "inte_tranat")),
    ],
    due: oldestFirst(pointsWith((s, p) => s !== "behover_trana" && !!p && isDueForRepetition(p, now, dueOptions))),
    kan: shuffle(pointsWith((s) => s === "kan")),
    otranat: spreadByArea(pointsWith((s) => s === "inte_tranat")),
    tranat: [...shuffle(pointsWith((s) => s === "kan")), ...shuffle(pointsWith((s) => s === "osaker"))],
    alla: spreadByArea(keys),
  };

  const isNewStudent = points.every((p) => p.status === "inte_tranat");
  let phase: ExamPhase = options.phase ?? "ingen";
  // Provdagen är bara repetition av det eleven tränat. Har eleven inte tränat något blir det en vanlig runda.
  if (phase === "provdag" && !buckets.tranat.length) phase = "ingen";

  const chosen: string[] = [];
  const takenQuestions = new Set<string>();
  const usedPoints = new Set<string>();

  const takeFrom = (list: string[], count: number) => {
    for (const key of list) {
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

  if (isNewStudent && phase !== "provdag") {
    takeFrom(buckets.otranat, size);
  } else {
    const plan = PLANS[phase];
    for (const [bucket, count] of plan.slots) takeFrom(buckets[bucket], count);
    for (const bucket of plan.fill) takeFrom(buckets[bucket], size - chosen.length);
  }

  // Sista utfyllnad om testet har få punkter: fler frågor från samma punkter.
  // På provdagen bara från punkter eleven redan tränat.
  const fillPool =
    phase === "provdag" ? pool.filter((q) => q.knowledge_point_id && buckets.tranat.includes(q.knowledge_point_id)) : pool;
  for (const preferFresh of [true, false]) {
    for (const q of shuffle(fillPool)) {
      if (chosen.length >= size) break;
      if (takenQuestions.has(q.id) || (preferFresh && previous.has(q.id))) continue;
      chosen.push(q.id);
      takenQuestions.add(q.id);
    }
  }

  // Högst två frågor gemensamma med förra rundan, när poolen räcker.
  const repeats = chosen.filter((id) => previous.has(id));
  if (repeats.length > MAX_REPEAT_FROM_LAST_ROUND) {
    const fresh = shuffle(fillPool.filter((q) => !takenQuestions.has(q.id) && !previous.has(q.id)));
    for (const id of repeats.slice(MAX_REPEAT_FROM_LAST_ROUND)) {
      const replacement = fresh.shift();
      if (!replacement) break;
      chosen[chosen.indexOf(id)] = replacement.id;
    }
  }

  return shuffle(chosen);
}
