type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/** En elevs önskemål om att få testet förnyat (efter alla rätt). */
export type OpenRenewal = {
  id: string;
  studySetId: string;
  studentName: string;
  createdAt: string;
  isOfficial: boolean;
  subjectId: string | null;
};

type Row = {
  id: string;
  study_set_id: string;
  created_at: string;
  profiles: { display_name: string } | null;
  study_sets: { is_official: boolean; chapters: { subject_id: string } | null } | null;
};

/** Öppna önskemål till den här föräldern, äldst först. */
export async function getOpenRenewals(
  supabase: Client,
  adminId: string,
  studySetIds?: string[],
): Promise<OpenRenewal[]> {
  if (studySetIds && !studySetIds.length) return [];
  let query = supabase
    .from("renewal_requests")
    .select(
      "id, study_set_id, created_at, profiles!renewal_requests_student_id_fkey(display_name), study_sets(is_official, chapters(subject_id))",
    )
    .eq("admin_id", adminId)
    .eq("status", "open")
    .order("created_at");
  if (studySetIds) query = query.in("study_set_id", studySetIds);

  const { data, error } = await query;
  if (error) {
    console.error("Kunde inte hämta önskemål om förnyelse:", error);
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    studySetId: r.study_set_id,
    studentName: r.profiles?.display_name?.split(" ")[0] ?? "Din elev",
    createdAt: r.created_at,
    isOfficial: r.study_sets?.is_official ?? false,
    subjectId: r.study_sets?.chapters?.subject_id ?? null,
  }));
}

export function groupBySet(list: OpenRenewal[]): Map<string, OpenRenewal[]> {
  const map = new Map<string, OpenRenewal[]>();
  for (const r of list) map.set(r.studySetId, [...(map.get(r.studySetId) ?? []), r]);
  return map;
}

/** "Isac", "Isac och Ella", "Isac, Ella och Noah" */
export function joinNames(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} och ${unique[unique.length - 1]}`;
}
