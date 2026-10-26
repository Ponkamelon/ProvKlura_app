type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/** Elevens tilldelade quiztest (inte Skrivklura), med provdatum från tilldelningen. */
export type StudentQuizSet = {
  id: string;
  title: string;
  subject: string | null;
  isOfficial: boolean;
  examDate: string | null;
  /** Provområdet (knowledge_points.area); null = hela testet. */
  examAreas: string[] | null;
  assignedAt: string;
};

export async function getStudentQuizSets(supabase: Client, studentId: string): Promise<StudentQuizSet[]> {
  const { data } = await supabase
    .from("assignments")
    .select("study_set_id, exam_date, exam_areas, assigned_at, study_sets(id, title, status, set_type, is_official, exam_date, chapters(subjects(name)))")
    .eq("student_id", studentId);

  type Row = {
    study_set_id: string;
    exam_date: string | null;
    exam_areas: string[] | null;
    assigned_at: string;
    study_sets: {
      id: string;
      title: string;
      status: string;
      set_type: string;
      is_official: boolean;
      exam_date: string | null;
      chapters: { subjects: { name: string } | null } | null;
    } | null;
  };

  const seen = new Set<string>();
  const result: StudentQuizSet[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const s = r.study_sets;
    if (!s || s.status !== "published" || s.set_type === "skriv" || seen.has(s.id)) continue;
    seen.add(s.id);
    result.push({
      id: s.id,
      title: s.title,
      subject: s.chapters?.subjects?.name?.replace(/^Nationell\s+/i, "") ?? null,
      isOfficial: s.is_official,
      examDate: r.exam_date ?? s.exam_date ?? null,
      examAreas: r.exam_areas?.length ? r.exam_areas : null,
      assignedAt: r.assigned_at,
    });
  }
  return result;
}
