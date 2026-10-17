import { isoWeekNumber, lastWeekStarts } from "@/lib/nutid/week";

export type AttemptRow = {
  week_start: string;
  solved: unknown;
  solved_count: number;
  total: number;
  completed_at: string | null;
};

export type WeekStatus = "klar" | "delvis" | "tom";

export type NutidProgress = {
  weeks: { weekStart: string; week: number; status: WeekStatus; solved: number }[];
  totalWords: number;
  level: { name: string; nextName: string | null; wordsToNext: number; share: number };
  /** Alltid en uppmuntrande mening — aldrig "du missade". */
  trend: string;
};

const LEVELS = [
  { name: "Nyfiken", from: 0 },
  { name: "Spanare", from: 10 },
  { name: "Nyhetskoll", from: 25 },
  { name: "Nyhetsexpert", from: 50 },
];

export function computeProgress(attempts: AttemptRow[], weeksBack = 8): NutidProgress {
  const starts = lastWeekStarts(weeksBack);

  const weeks = starts.map((weekStart) => {
    const inWeek = attempts.filter((a) => a.week_start === weekStart);
    const solved = inWeek.reduce((sum, a) => sum + a.solved_count, 0);
    const status: WeekStatus = inWeek.some((a) => a.completed_at)
      ? "klar"
      : solved > 0
        ? "delvis"
        : "tom";
    return { weekStart, week: isoWeekNumber(weekStart), status, solved };
  });

  const words = new Set<string>();
  for (const a of attempts) {
    if (Array.isArray(a.solved)) for (const w of a.solved) if (typeof w === "string") words.add(w);
  }
  const totalWords = words.size;

  const levelIndex = LEVELS.reduce((idx, l, i) => (totalWords >= l.from ? i : idx), 0);
  const current = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1] ?? null;
  const level = {
    name: current.name,
    nextName: next?.name ?? null,
    wordsToNext: next ? next.from - totalWords : 0,
    share: next ? (totalWords - current.from) / (next.from - current.from) : 1,
  };

  // Sammanhängande veckor med något löst, räknat bakåt från förra eller
  // denna vecka. Visas bara när det är minst två — en bruten svit nämns aldrig.
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].status !== "tom") streak++;
    else if (i === weeks.length - 1) continue;
    else break;
  }
  const recent = weeks.slice(-4).reduce((s, w) => s + w.solved, 0);
  const earlier = weeks.slice(-8, -4).reduce((s, w) => s + w.solved, 0);

  let trend = "Varje ord du löser gör din nutidskoll lite större.";
  if (streak >= 2) trend = `Du har varit med ${streak} veckor i rad. Snyggt!`;
  else if (recent > earlier && earlier > 0) trend = "Du har löst fler ord de senaste fyra veckorna än veckorna innan.";
  else if (totalWords > 0 && recent > 0) trend = `Du har löst ${recent} ord den senaste månaden.`;

  return { weeks, totalWords, level, trend };
}
