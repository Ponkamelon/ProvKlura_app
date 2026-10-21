/**
 * Elevens översikt: svit (dagar i rad), antal klara test och aktiv tid.
 * Datum är ISO-dagar i svensk tid ("2026-10-21").
 */

export type OverviewData = { days: string[]; tests: number; seconds: number };

export type Streak = {
  /** Dagar i rad fram till idag (eller igår, om eleven inte hunnit plugga idag). */
  current: number;
  best: number;
  activeToday: boolean;
};

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Date(d.getTime() + delta * 86400000).toISOString().slice(0, 10);
}

export function computeStreak(days: string[], today: string): Streak {
  const set = new Set(days);
  const activeToday = set.has(today);

  // Svit räknas fram till idag — eller till igår, så att den inte "går
  // sönder" på morgonen innan eleven hunnit öppna appen.
  let current = 0;
  let day = activeToday ? today : addDays(today, -1);
  while (set.has(day)) {
    current++;
    day = addDays(day, -1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...set].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }

  return { current, best: Math.max(best, current), activeToday };
}

/** Måndag–söndag i innevarande vecka, med markering för dagar eleven pluggat. */
export function weekStrip(days: string[], today: string) {
  const set = new Set(days);
  const t = new Date(`${today}T12:00:00Z`);
  const monday = addDays(today, -((t.getUTCDay() + 6) % 7));
  const labels = ["M", "T", "O", "T", "F", "L", "S"];
  return labels.map((label, i) => {
    const date = addDays(monday, i);
    return { date, label, active: set.has(date), isToday: date === today, future: date > today };
  });
}

/** "45 min", "1 h 20 min", "12 h" */
export function formatStudyTime(seconds: number): { value: string; unit: string } {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { value: String(minutes), unit: "min" };
  const hours = minutes / 60;
  const shown = hours < 10 ? hours.toFixed(1).replace(".", ",").replace(",0", "") : String(Math.round(hours));
  return { value: shown, unit: shown === "1" ? "timme" : "timmar" };
}

export function parseOverview(raw: unknown): OverviewData {
  const o = (raw ?? {}) as Partial<OverviewData>;
  return {
    days: Array.isArray(o.days) ? o.days.map(String) : [],
    tests: Number(o.tests) || 0,
    seconds: Number(o.seconds) || 0,
  };
}
