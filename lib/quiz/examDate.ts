/**
 * Provdatum på testkortet (kravspec avsnitt 2 och 9): "Prov fredag · 3
 * dagar kvar". Passerade prov räknas som inget kommande prov.
 */
const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const MONTHS = ["jan", "feb", "mars", "april", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

export function daysUntil(examDate: string, today: string): number {
  return Math.round((Date.parse(`${examDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

export function examLabel(examDate: string | null, today: string): string {
  if (!examDate) return "Inget provdatum";
  const days = daysUntil(examDate, today);
  if (days < 0) return "Inget kommande prov";
  if (days === 0) return "Prov idag";
  if (days === 1) return "Prov imorgon";
  const d = new Date(`${examDate}T12:00:00Z`);
  const when = days < 7 ? WEEKDAYS[d.getUTCDay()] : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `Prov ${when} · ${days} dagar kvar`;
}

/** Sortering: närmaste kommande prov först, sedan test utan provdatum i tilldelningsordning. */
export function compareByExam(
  a: { examDate: string | null; assignedAt: string },
  b: { examDate: string | null; assignedAt: string },
  today: string,
): number {
  const ka = a.examDate && daysUntil(a.examDate, today) >= 0 ? a.examDate : null;
  const kb = b.examDate && daysUntil(b.examDate, today) >= 0 ? b.examDate : null;
  if (ka && kb && ka !== kb) return ka.localeCompare(kb);
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return a.assignedAt.localeCompare(b.assignedAt);
}
