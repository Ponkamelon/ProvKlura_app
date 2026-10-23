/**
 * Tydligt avslut (kravspec avsnitt 6): högst tre korta besked — insats,
 * resultat och nästa steg. En före/efter-jämförelse visas bara när
 * underlaget är jämförbart (samma kunskapspunkter, samma hjälpnivå,
 * samma svårighet när den finns) och bara när eleven gjort framsteg.
 */

export type SummaryAnswer = {
  knowledgePointId: string | null;
  pointName: string | null;
  area: string | null;
  correct: boolean | null;
  skipped: boolean;
  helpUsed: boolean;
  difficulty: string | null;
};

export type PriorAnswer = {
  knowledgePointId: string;
  correct: boolean;
  difficulty: string | null;
};

export type RoundSummary = { effort: string; result: string; next: string };

const WORDS = ["noll", "en", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio"];
const num = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

/** "Cellkärna" → "cellkärna", men "DNA" och "EU" behålls. */
function inSentence(name: string): string {
  if (name.length > 1 && name[1] === name[1].toUpperCase() && /[A-ZÅÄÖ]/.test(name[1])) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function list(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} och ${unique[unique.length - 1]}`;
}

export function buildRoundSummary(params: {
  answers: SummaryAnswer[];
  /** Senaste tidigare svar per kunskapspunkt, före det här passet. */
  prior: PriorAnswer[];
  setTitle: string | null;
  testCount: number;
}): RoundSummary {
  const done = params.answers.filter((a) => !a.skipped);
  const n = done.length;
  const areas = [...new Set(done.map((a) => a.area).filter((a): a is string => !!a))];
  const frågor = n === 1 ? "fråga" : "frågor";

  let effort: string;
  if (areas.length === 1) effort = `Du tränade ${num(n)} ${frågor} om ${inSentence(areas[0])}.`;
  else if (params.testCount > 1) effort = `Du tränade ${num(n)} ${frågor} från ${num(params.testCount)} olika test.`;
  else if (params.setTitle) effort = `Du tränade ${num(n)} ${frågor} i ${params.setTitle}.`;
  else effort = `Du tränade ${num(n)} ${frågor}.`;

  const withoutHelp = done.filter((a) => !a.helpUsed);
  const correct = withoutHelp.filter((a) => a.correct);
  const correctNames = correct.map((a) => a.pointName).filter((x): x is string => !!x).map(inSentence);
  const wrongNames = done
    .filter((a) => !a.correct)
    .map((a) => a.pointName)
    .filter((x): x is string => !!x)
    .map(inSentence);

  // Före/efter: samma punkter, utan hjälp, samma svårighet när den finns.
  const priorByPoint = new Map(params.prior.map((p) => [p.knowledgePointId, p]));
  const comparable = withoutHelp.filter((a) => {
    if (!a.knowledgePointId) return false;
    const p = priorByPoint.get(a.knowledgePointId);
    return !!p && (!a.difficulty || !p.difficulty || a.difficulty === p.difficulty);
  });
  const before = comparable.filter((a) => priorByPoint.get(a.knowledgePointId!)!.correct).length;
  const now = comparable.filter((a) => a.correct).length;

  let result: string;
  if (comparable.length >= 3 && now > before) {
    result = `Förra gången klarade du ${num(before)} av ${num(comparable.length)} jämförbara frågor utan hjälp. Nu klarade du ${num(now)}.`;
  } else if (correct.length > 0) {
    const names = [...new Set(correctNames)];
    const about = names.length
      ? ` – ${names.length > 3 ? "bland annat " : ""}${names.length === 1 ? "frågan" : "frågorna"} om ${list(names.slice(0, 3))}`
      : "";
    result =
      correct.length === n
        ? `Du klarade alla ${num(n)} utan hjälp${about}.`
        : `Du klarade ${num(correct.length)} av ${num(n)} utan hjälp${about}.`;
  } else {
    result = "Du har gett det ett försök – nu vet du vad som är värt att öva på.";
  }

  const next = wrongNames.length
    ? `Nästa gång repeterar vi ${list(wrongNames.slice(0, 2))}.`
    : "Nästa gång befäster vi det du kan och tar in något nytt.";

  return { effort, result, next };
}
