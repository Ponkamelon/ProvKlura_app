import { currentWeekStart, isoWeekNumber } from "@/lib/nutid/week";
import { isUsableKryss, type NutidKryssRow } from "@/lib/nutid/types";

type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

const COLUMNS = "id, week_start, status, is_evergreen, title, entries, error, created_at, published_at";

/**
 * Veckans kryss: det publicerade nyhetskrysset för veckan om det finns,
 * annars ett av de tidlösa reservkryssen (roterar per vecka). Eleven får
 * alltså alltid ett kryss, även om ingen hunnit granska veckans utkast.
 */
export async function getCurrentKryss(supabase: Client): Promise<NutidKryssRow | null> {
  const weekStart = currentWeekStart();

  const { data: news } = await supabase
    .from("nutidskryss")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("is_evergreen", false)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (news && isUsableKryss(news as NutidKryssRow)) return news as NutidKryssRow;

  const { data: evergreen } = await supabase
    .from("nutidskryss")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("is_evergreen", true)
    .order("created_at")
    .order("title");

  const usable = ((evergreen ?? []) as NutidKryssRow[]).filter(isUsableKryss);
  if (!usable.length) return null;
  return usable[isoWeekNumber(weekStart) % usable.length];
}

export const NUTID_COLUMNS = COLUMNS;
