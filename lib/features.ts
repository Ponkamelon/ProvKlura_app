type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * Funktioner som slås på i förväg för enskilda elever (feature_previews),
 * medan nuläget mäts. När en funktion släpps för alla läggs den i RELEASED.
 */
export type Feature = "fortsatt" | "steg1";

const RELEASED: Feature[] = [];

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
