import { isoWeekNumber, lastWeekStarts } from "@/lib/nutid/week";

export type AttemptRow = {
  week_start: string;
  /** Antal rätt. */
  solved_count: number;
  total: number;
  completed_at: string | null;
};

export type WeekStatus = "klar" | "delvis" | "tom";

export type NutidProgress = {
  weeks: { weekStart: string; week: number; status: WeekStatus; correct: number }[];
  totalCorrect: number;
  level: { name: string; nextName: string | null; toNext: number; share: number };
  /** Alltid en uppmuntrande mening — aldrig "du missade". */
  trend: string;
};

const LEVELS = [
  { name: "Nyfiken", from: 0 },
  { name: "Spanare", from: 15 },
  { name: "Nyhetskoll", from: 40 },
  { name: "Nyhetsexpert", from: 80 },
];

export function computeProgress(attempts: AttemptRow[], weeksBack = 8): NutidProgress {
  const starts = lastWeekStarts(weeksBack);

  const weeks = starts.map((weekStart) => {
    const inWeek = attempts.filter((a) => a.week_start === weekStart);
    const correct = inWeek.reduce((sum, a) => sum + a.solved_count, 0);
    const status: WeekStatus = inWeek.some((a) => a.completed_at)
      ? "klar"
      : inWeek.length
        ? "delvis"
        : "tom";
    return { weekStart, week: isoWeekNumber(weekStart), status, correct };
  });

  const totalCorrect = attempts.reduce((sum, a) => sum + a.solved_count, 0);

  const levelIndex = LEVELS.reduce((idx, l, i) => (totalCorrect >= l.from ? i : idx), 0);
  const current = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1] ?? null;
  const level = {
    name: current.name,
    nextName: next?.name ?? null,
    toNext: next ? next.from - totalCorrect : 0,
    share: next ? (totalCorrect - current.from) / (next.from - current.from) : 1,
  };

  // Sammanhängande veckor med något gjort, räknat bakåt. En bruten svit nämns aldrig.
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].status !== "tom") streak++;
    else if (i === weeks.length - 1) continue;
    else break;
  }
  const recent = weeks.slice(-4).reduce((s, w) => s + w.correct, 0);
  const earlier = weeks.slice(-8, -4).reduce((s, w) => s + w.correct, 0);

  let trend = "Varje vecka du är med gör din nyhetskoll lite större.";
  if (streak >= 2) trend = `Du har varit med ${streak} veckor i rad. Snyggt!`;
  else if (recent > earlier && earlier > 0) trend = "Du har fått fler rätt de senaste fyra veckorna än veckorna innan.";
  else if (recent > 0) trend = `Du har fått ${recent} rätt den senaste månaden.`;

  return { weeks, totalCorrect, level, trend };
}
