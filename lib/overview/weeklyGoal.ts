/**
 * Eget veckomål (kravspec avsnitt 4). Eleven väljer hur många dagar i
 * veckan hen vill göra klart minst ett test. Bara genomförda dagar räknas,
 * och missade dagar nollställer inget: "veckor med nått mål" kan bara öka.
 */

export type GoalRow = { target_days: number; valid_from: string };

export const GOAL_CHOICES = [1, 2, 3, 4, 5] as const;

function addDays(iso: string, delta: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  const weekday = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

/** Tidpunkt → datum i svensk tid. */
function stockholmDate(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** Målet som gällde en vecka: det senaste som valdes senast veckans söndag. */
function goalForWeek(goals: GoalRow[], monday: string): number | null {
  const sunday = addDays(monday, 6);
  let target: number | null = null;
  for (const g of goals) if (stockholmDate(g.valid_from) <= sunday) target = g.target_days;
  return target;
}

export type WeeklyGoalStatus = {
  /** Aktuellt mål, eller null om eleven inte valt något. */
  target: number | null;
  /** Dagar med minst ett klart test den här veckan. */
  doneThisWeek: number;
  reached: boolean;
  /** Veckor (sedan första målet) där målet nåddes. Minskar aldrig. */
  weeksReached: number;
};

export function weeklyGoalStatus(days: string[], goals: GoalRow[], today: string): WeeklyGoalStatus {
  const sorted = [...goals].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const daySet = new Set(days);
  const thisMonday = mondayOf(today);
  const countWeek = (monday: string) =>
    Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => daySet.has(d)).length;

  const target = sorted.length ? sorted[sorted.length - 1].target_days : null;
  const doneThisWeek = countWeek(thisMonday);

  let weeksReached = 0;
  if (sorted.length) {
    for (let monday = mondayOf(stockholmDate(sorted[0].valid_from)); monday <= thisMonday; monday = addDays(monday, 7)) {
      const weekTarget = goalForWeek(sorted, monday);
      if (weekTarget && countWeek(monday) >= weekTarget) weeksReached++;
    }
  }

  return { target, doneThisWeek, reached: target !== null && doneThisWeek >= target, weeksReached };
}
