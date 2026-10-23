type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * "Fortsätt där du var" (kravspec avsnitt 2 och 4): det senaste passet som
 * eleven pausade, eller lämnade mitt i, och som har frågor kvar.
 */
export type ResumableAttempt = {
  id: string;
  studySetId: string;
  title: string;
  answered: number;
  total: number;
};

/** Ett pass som står som pågående räknas som lämnat efter så här lång tid. */
const ACTIVE_IDLE_MS = 10 * 60 * 1000;
const MAX_AGE_DAYS = 14;

export async function getResumableAttempt(supabase: Client, studentId: string): Promise<ResumableAttempt | null> {
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
  const { data } = await supabase
    .from("attempts")
    .select("id, study_set_id, status, question_ids, last_activity_at, answers(count), study_sets(title)")
    .eq("student_id", studentId)
    .in("status", ["paused", "active"])
    .is("completed_at", null)
    .not("question_ids", "is", null)
    .gte("last_activity_at", since)
    .order("last_activity_at", { ascending: false })
    .limit(5);

  for (const row of (data ?? []) as unknown as {
    id: string;
    study_set_id: string;
    status: string;
    question_ids: string[];
    last_activity_at: string;
    answers: { count: number }[] | null;
    study_sets: { title: string } | null;
  }[]) {
    const answered = row.answers?.[0]?.count ?? 0;
    const total = row.question_ids.length;
    if (!row.study_sets || answered >= total) continue;
    // Ett pass som bara startades och lämnades utan svar är inget att fortsätta på.
    if (row.status === "active" && (answered === 0 || Date.now() - Date.parse(row.last_activity_at) < ACTIVE_IDLE_MS)) continue;
    return { id: row.id, studySetId: row.study_set_id, title: row.study_sets.title, answered, total };
  }
  return null;
}
