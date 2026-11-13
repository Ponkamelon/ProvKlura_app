import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NutidProgressView } from "@/components/NutidProgressView";
import { computeProgress, type AttemptRow } from "@/lib/nutid/progress";
import { Icon } from "@/components/Icon";
import { StudentAssignments, type AssignmentRow } from "@/components/StudentAssignments";

export default async function StudentDetailPage({
  params,
}: {
  params: { studentId: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.studentId)
    .eq("role", "student")
    .maybeSingle();

  if (!student) {
    return <p className="text-navy/70">Hittade inte eleven.</p>;
  }

  const [{ data: assignments }, { data: ownSets }, { data: trainedRows }] = await Promise.all([
    supabase
      .from("assignments")
      .select("study_set_id, exam_date, assigned_by, assigned_at")
      .eq("student_id", student.id)
      .order("assigned_at", { ascending: false }),
    // Förälderns egna publicerade test, så de kan läggas till härifrån.
    supabase
      .from("study_sets")
      .select("id")
      .eq("admin_id", profile.id)
      .eq("status", "published"),
    supabase
      .from("attempts")
      .select("study_set_id, started_at")
      .eq("student_id", student.id)
      .not("study_set_id", "is", null)
      .order("started_at", { ascending: false })
      .limit(1000),
  ]);

  const studySetIds = [
    ...new Set([...(assignments ?? []).map((a) => a.study_set_id as string), ...(ownSets ?? []).map((s) => s.id as string)]),
  ];

  type SetRow = { id: string; title: string; is_official: boolean; chapters: { subjects: { name: string } | null } | null };
  const { data: studySetData } = studySetIds.length
    ? await supabase.from("study_sets").select("id, title, is_official, chapters(subjects(name))").in("id", studySetIds)
    : { data: [] };
  const studySets = (studySetData ?? []) as unknown as SetRow[];

  const studySetTitleById = new Map(studySets.map((s) => [s.id, s.title]));

  const lastTrainedBySet = new Map<string, string>();
  for (const t of trainedRows ?? []) {
    if (!lastTrainedBySet.has(t.study_set_id as string)) lastTrainedBySet.set(t.study_set_id as string, t.started_at as string);
  }
  const setById = new Map(studySets.map((s) => [s.id, s]));
  type AssignmentInfo = { study_set_id: string; exam_date: string | null; assigned_by: string | null };
  const assignedById = new Map<string, AssignmentInfo>(
    ((assignments ?? []) as AssignmentInfo[]).map((a) => [a.study_set_id, a]),
  );
  const toRow = (setId: string): AssignmentRow | null => {
    const set = setById.get(setId);
    if (!set) return null;
    const a = assignedById.get(setId);
    return {
      setId,
      title: set.title,
      subject: (set.chapters?.subjects?.name ?? "Övrigt").replace(/^Nationell\s+/i, ""),
      isOfficial: set.is_official,
      assigned: !!a,
      locked: !!a && a.assigned_by !== profile.id && !(ownSets ?? []).some((s) => s.id === setId),
      examDate: (a?.exam_date as string | null) ?? null,
      lastTrained: lastTrainedBySet.get(setId) ?? null,
    };
  };
  const assignmentRows = [
    ...(assignments ?? []).map((a) => toRow(a.study_set_id as string)),
    ...(ownSets ?? []).filter((s) => !assignedById.has(s.id as string)).map((s) => toRow(s.id as string)),
  ].filter((r): r is AssignmentRow => !!r);

  const { data: attempts } = await supabase
    .from("attempts")
    .select("id, study_set_id, score, total_questions, started_at, completed_at")
    .eq("student_id", student.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const { data: progress } = await supabase
    .from("question_progress")
    .select("mastery_level")
    .eq("student_id", student.id);

  const masteryCounts = {
    mastered: progress?.filter((p) => p.mastery_level === "mastered").length ?? 0,
    learning: progress?.filter((p) => p.mastery_level === "learning").length ?? 0,
    needs_practice: progress?.filter((p) => p.mastery_level === "needs_practice").length ?? 0,
  };

  const { data: nutidAttempts } = await supabase
    .from("nutidskryss_attempts")
    .select("week_start, solved_count, total, completed_at")
    .eq("student_id", student.id);
  const nutidProgress = computeProgress((nutidAttempts ?? []) as AttemptRow[]);
  const nutidActiveWeeks = nutidProgress.weeks.filter((w) => w.status !== "tom").length;

  const completedAttempts = attempts?.filter((a) => a.completed_at) ?? [];
  const avgScore = completedAttempts.length
    ? Math.round(
        (completedAttempts.reduce(
          (sum, a) => sum + (a.score ?? 0) / (a.total_questions || 1),
          0,
        ) /
          completedAttempts.length) *
          100,
      )
    : null;

  return (
    <div>
      <Link href="/admin/elever" className="link-back">
        <Icon name="tillbaka" size={16} />
        Alla elever
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-navy/50">Åk {student.grade_level}</p>
          <h1 className="font-display text-3xl font-semibold text-navy">
            {student.display_name}
          </h1>
          <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
        </div>
        <Link href={`/admin/elever/${student.id}/anpassningar`} className="btn-secondary">
          <Icon name="anpassningar" />
          Anpassningar
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="notebook-card p-6">
          <p className="text-sm text-navy/60">Snittresultat</p>
          <p className="mt-1 font-display text-3xl font-semibold text-navy">
            {avgScore !== null ? `${avgScore}%` : "—"}
          </p>
        </div>
        <div className="notebook-card p-6">
          <p className="text-sm text-navy/60">Sitter</p>
          <p className="mt-1 font-display text-3xl font-semibold text-ocean-dark">
            {masteryCounts.mastered}
          </p>
        </div>
        <div className="notebook-card p-6">
          <p className="text-sm text-navy/60">Behöver tränas</p>
          <p className="mt-1 font-display text-3xl font-semibold text-coral">
            {masteryCounts.needs_practice}
          </p>
        </div>
      </div>

      <StudentAssignments
        studentId={student.id}
        firstName={(student.display_name ?? "eleven").split(" ")[0]}
        rows={assignmentRows}
      />

      <section className="nutid-card mt-10 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold text-navy">Nutidskrysset</h2>
          <p className="text-sm text-navy/60">
            Med {nutidActiveWeeks} av de senaste 8 veckorna · {nutidProgress.totalCorrect} rätt totalt ·
            nivå {nutidProgress.level.name}
          </p>
        </div>
        <div className="mt-4 max-w-md">
          <NutidProgressView progress={nutidProgress} compact />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-navy">Historik</h2>
        {!attempts?.length ? (
          <p className="mt-3 text-navy/60">Inga genomförda test än.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {attempts.map((a) => {
              const percent =
                a.total_questions && a.score !== null
                  ? Math.round((a.score / a.total_questions) * 100)
                  : null;
              return (
                <div
                  key={a.id}
                  className="notebook-card flex items-center justify-between p-4"
                >
                  <div>
                    <p className="font-medium text-navy">
                      {studySetTitleById.get(a.study_set_id) ?? "Okänt projekt"}
                    </p>
                    <p className="text-xs text-navy/50">
                      {new Date(a.started_at).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  <div className="text-right">
                    {a.completed_at ? (
                      <>
                        <p className="font-mono font-semibold text-navy">
                          {a.score} / {a.total_questions}
                        </p>
                        <p className="text-xs text-navy/50">{percent}%</p>
                      </>
                    ) : (
                      <p className="text-xs text-navy/40">Ej avslutat</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
