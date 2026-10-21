type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

export type QuestionVariant = {
  question_id: string;
  question: string;
  answer_options: string[] | null;
  correct_answer: string;
  accepted_answers: string[] | null;
  explanation: string | null;
};

type ActiveRewording = { id: string; study_set_id: string; activated_at: string | null };

/**
 * Aktiva omformuleringar som eleven får se. RLS släpper bara igenom
 * versioner från den förälder som tilldelat testet till eleven; har två
 * föräldrar tilldelat samma test vinner den senast aktiverade.
 */
export async function getActiveRewordings(
  supabase: Client,
  studySetIds: string[],
): Promise<Map<string, ActiveRewording>> {
  const result = new Map<string, ActiveRewording>();
  if (!studySetIds.length) return result;

  const { data } = await supabase
    .from("test_rewordings")
    .select("id, study_set_id, activated_at")
    .eq("status", "active")
    .in("study_set_id", studySetIds)
    .order("activated_at", { ascending: false });

  for (const r of (data ?? []) as ActiveRewording[]) {
    if (!result.has(r.study_set_id)) result.set(r.study_set_id, r);
  }
  return result;
}

export async function getVariantsForStudySet(
  supabase: Client,
  studySetId: string,
): Promise<{ variants: Map<string, QuestionVariant>; activatedAt: string | null }> {
  const active = (await getActiveRewordings(supabase, [studySetId])).get(studySetId);
  if (!active) return { variants: new Map(), activatedAt: null };

  const { data } = await supabase
    .from("question_variants")
    .select("question_id, question, answer_options, correct_answer, accepted_answers, explanation")
    .eq("rewording_id", active.id);

  return {
    variants: new Map(((data ?? []) as QuestionVariant[]).map((v) => [v.question_id, v])),
    activatedAt: active.activated_at,
  };
}

/** Vilken variant gäller för en enskild fråga (används vid rättning). */
export async function getVariantForQuestion(supabase: Client, questionId: string): Promise<QuestionVariant | null> {
  const { data } = await supabase
    .from("question_variants")
    .select("question_id, question, answer_options, correct_answer, accepted_answers, explanation, test_rewordings!inner(status, activated_at)")
    .eq("question_id", questionId)
    .eq("test_rewordings.status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as unknown as QuestionVariant | undefined) ?? null;
}

/**
 * Test som har uppdaterats sedan eleven senast startade dem (eller som
 * eleven inte gjort sedan uppdateringen). Ger underlag för ikonen.
 */
export async function getUpdatedStudySetIds(
  supabase: Client,
  studentId: string,
  studySetIds: string[],
): Promise<Set<string>> {
  const updated = new Set<string>();
  const active = await getActiveRewordings(supabase, studySetIds);
  if (!active.size) return updated;

  const { data: attempts } = await supabase
    .from("attempts")
    .select("study_set_id, started_at")
    .eq("student_id", studentId)
    .in("study_set_id", [...active.keys()]);

  const lastStart = new Map<string, number>();
  for (const a of attempts ?? []) {
    const t = Date.parse(a.started_at);
    if (t > (lastStart.get(a.study_set_id) ?? 0)) lastStart.set(a.study_set_id, t);
  }

  for (const [setId, r] of active) {
    const activated = r.activated_at ? Date.parse(r.activated_at) : 0;
    if ((lastStart.get(setId) ?? 0) < activated) updated.add(setId);
  }
  return updated;
}
