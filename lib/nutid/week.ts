/**
 * Veckor räknas måndag–söndag i svensk tid, så att krysset byts samtidigt
 * för alla oavsett var servern står.
 */

function stockholmToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${parts}T12:00:00Z`);
}

/** Dagens datum i svensk tid, t.ex. "2026-10-21". */
export function stockholmTodayIso(): string {
  return toIsoDate(stockholmToday());
}

export function mondayOf(date: Date): Date {
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * 86400000);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Måndagen i innevarande vecka, t.ex. "2026-10-12". */
export function currentWeekStart(): string {
  return toIsoDate(mondayOf(stockholmToday()));
}

export function isoWeekNumber(weekStart: string): number {
  const monday = new Date(`${weekStart}T12:00:00Z`);
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** De n senaste veckornas måndagar, äldst först, innevarande vecka sist. */
export function lastWeekStarts(n: number): string[] {
  const current = new Date(`${currentWeekStart()}T12:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    toIsoDate(new Date(current.getTime() - (n - 1 - i) * 7 * 86400000)),
  );
}
