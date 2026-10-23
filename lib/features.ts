type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * Funktioner som slås på i förväg för enskilda elever (feature_previews),
 * medan nuläget mäts. När en funktion släpps för alla läggs den i RELEASED.
 */
export type Feature = "fortsatt" | "steg1";

// Släppt för alla 23 okt 2026 (Pontus beslut, i stället för att vänta ut nulägesmätningen).
const RELEASED: Feature[] = ["fortsatt", "steg1"];

export async function hasFeature(supabase: Client, studentId: string, feature: Feature): Promise<boolean> {
  if (RELEASED.includes(feature)) return true;
  const { data } = await supabase
    .from("feature_previews")
    .select("feature")
    .eq("student_id", studentId)
    .eq("feature", feature)
    .maybeSingle();
  return !!data;
}
