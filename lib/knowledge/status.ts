type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * Kunskapsstatus per punkt (kravspec avsnitt 5), beräknad i databasen av
 * my_point_status(). "Inte tränat" skiljs från "Behöver träna", så att
 * okända kunskaper inte framställs som misslyckanden.
 */
export type PointStatus = "kan" | "osaker" | "behover_trana" | "inte_tranat";

export type PointStatusRow = {
  study_set_id: string;
  knowledge_point_id: string;
  area: string;
  name: string;
  status: PointStatus;
  answers_count: number;
  last_answered: string | null;
  /** När punkten är aktuell för repetition enligt schemat (1, 3, 7, 14, 30 dagar). */
  due_at?: string | null;
  /** Steg i schemat, 0–4. */
  review_step?: number | null;
};

export type DueOptions = {
  /** Använd repetitionsschemat (steg 2). Annars förenklad startregel. */
  schedule?: boolean;
  /** Provet är inom 7 dagar: intervallen komprimeras till ett dygn (kravspec avsnitt 8). */
  compress?: boolean;
};

export const STATUS_LABEL: Record<PointStatus, string> = {
  kan: "Kan",
  osaker: "Osäker",
  behover_trana: "Behöver träna",
  inte_tranat: "Inte tränat",
};

/** Ordning i staplar och listor: det eleven kan först. */
export const STATUS_ORDER: PointStatus[] = ["kan", "osaker", "behover_trana", "inte_tranat"];

export async function getPointStatuses(supabase: Client, studySetIds: string[]): Promise<PointStatusRow[]> {
  if (!studySetIds.length) return [];
  const { data, error } = await supabase.rpc("my_point_status", { p_study_set_ids: studySetIds });
  if (error) {
    console.error("Kunde inte hämta kunskapsstatus:", error.message);
    return [];
  }
  return (data ?? []) as PointStatusRow[];
}

export type StatusCounts = Record<PointStatus, number> & { total: number };

export function countStatuses(rows: PointStatusRow[]): StatusCounts {
  const counts: StatusCounts = { kan: 0, osaker: 0, behover_trana: 0, inte_tranat: 0, total: 0 };
  for (const r of rows) {
    counts[r.status]++;
    counts.total++;
  }
  return counts;
}

/**
 * Är punkten aktuell för repetition? Med schemat (steg 2) avgör due_at:
 * 1, 3, 7, 14, 30 dagar, där fel ger återbesök nästa dag. Är provet inom
 * sju dagar komprimeras intervallen till ett dygn. Utan schema gäller
 * startregeln: ett dygn, eller en vecka för punkter eleven kan.
 */
export function isDueForRepetition(row: PointStatusRow, now = Date.now(), options: DueOptions = {}): boolean {
  if (row.status === "inte_tranat" || !row.last_answered) return false;
  const ageDays = (now - Date.parse(row.last_answered)) / 86400000;
  if (options.compress) return ageDays >= 1;
  if (options.schedule && row.due_at) return Date.parse(row.due_at) <= now;
  return row.status === "kan" ? ageDays >= 7 : ageDays >= 1;
}
