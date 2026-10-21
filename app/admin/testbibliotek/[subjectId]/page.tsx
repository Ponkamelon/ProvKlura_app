import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { OfficialBadge } from "@/components/OfficialBadge";
import { SkrivBadge } from "@/components/SkrivBadge";
import { getSubjectVisual } from "@/lib/subjectVisuals";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  shareOfficialTestAction,
  unshareOfficialTestAction,
} from "@/app/actions/testLibrary";
import { Icon } from "@/components/Icon";

type StudySetRow = {
  id: string;
  title: string;
  set_type: "deltest" | "sluttest" | "ovrigt" | "skriv";
  sort_order: number;
};

export default async function TestbibliotekSubjectPage({
  params,
}: {
  params: { subjectId: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", params.subjectId)
    .eq("is_official", true)
    .maybeSingle();

  if (!subject) {
    return <p className="text-navy/70">Hittade inte ämnet.</p>;
  }

  const subjectId = subject.id;
  const subjectVisual = getSubjectVisual(subject.name);

  const { data: rawStudySets } = await supabase
    .from("study_sets")
    .select("id, title, set_type, sort_order, chapters!inner(subject_id)")
    .eq("chapters.subject_id", subject.id)
    .eq("is_official", true)
    .order("sort_order");

  const studySets = (rawStudySets ?? []) as unknown as StudySetRow[];
  const studySetIds = studySets.map((s) => s.id);

  const { data: questionRows } = studySetIds.length
    ? await supabase
        .from("questions")
        .select("study_set_id")
        .in("study_set_id", studySetIds)
        .eq("status", "published")
    : { data: [] as { study_set_id: string }[] };

  const countByStudySet = new Map<string, number>();
  for (const q of questionRows ?? []) {
    countByStudySet.set(q.study_set_id, (countByStudySet.get(q.study_set_id) ?? 0) + 1);
  }

  const { data: myGuardianRows } = await supabase
    .from("student_guardians")
    .select("student_id")
    .eq("admin_id", profile.id);

  const myStudentIds = myGuardianRows?.map((g) => g.student_id) ?? [];

  const { data: students } = myStudentIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("role", "student")
        .in("id", myStudentIds)
        .order("display_name")
    : { data: [] as { id: string; display_name: string }[] };

  const { data: existingAssignments } = studySetIds.length
    ? await supabase
        .from("assignments")
        .select("id, study_set_id, student_id")
        .eq("assigned_by", profile.id)
        .in("study_set_id", studySetIds)
    : { data: [] as { id: string; study_set_id: string; student_id: string }[] };

  // Tester där föräldern har en aktiv omformulerad version.
  const { data: activeRewordings } = studySetIds.length
    ? await supabase
        .from("test_rewordings")
        .select("study_set_id")
        .eq("admin_id", profile.id)
        .eq("status", "active")
        .in("study_set_id", studySetIds)
    : { data: [] as { study_set_id: string }[] };
  const rewordedSetIds = new Set((activeRewordings ?? []).map((r) => r.study_set_id));

  const studentNameById = new Map((students ?? []).map((s) => [s.id, s.display_name]));

  const assignmentsBySet = new Map<string, { id: string; student_id: string }[]>();
  for (const a of existingAssignments ?? []) {
    const list = assignmentsBySet.get(a.study_set_id) ?? [];
    list.push({ id: a.id, student_id: a.student_id });
    assignmentsBySet.set(a.study_set_id, list);
  }

  const deltester = studySets.filter((s) => s.set_type === "deltest");
  const sluttest = studySets.filter((s) => s.set_type === "sluttest");
  const skrivovningar = studySets.filter((s) => s.set_type === "skriv");
  // Ett rent Skrivklura-ämne har inga quiz — visa då inte tomma rubriker.
  const onlyWriting = skrivovningar.length > 0 && !deltester.length && !sluttest.length;

  function TestRow({ set }: { set: StudySetRow }) {
    const shares = assignmentsBySet.get(set.id) ?? [];
    const sharedStudentIds = new Set(shares.map((s) => s.student_id));
    const availableStudents = (students ?? []).filter((s) => !sharedStudentIds.has(s.id));

    const isWriting = set.set_type === "skriv";

    return (
      <div
        className={`${isWriting ? "skriv-card" : "notebook-card"} scroll-mb-24 p-4`}
        style={isWriting ? undefined : { borderLeft: `6px solid ${subjectVisual.color}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-navy">{set.title}</p>
          <div className="flex shrink-0 items-center gap-2">
            {isWriting ? (
              <SkrivBadge />
            ) : (
              <>
                <OfficialBadge />
                <span className="whitespace-nowrap text-xs text-navy/50">
                  {countByStudySet.get(set.id) ?? 0} frågor
                </span>
              </>
            )}
          </div>
        </div>
        {isWriting ? (
          <p className="mt-1 text-sm text-navy/60">
            Lär → Träna → Testa. Eleven väljer 5, 10 eller 20 minuter.
          </p>
        ) : (
          <p className="mt-1 text-sm">
            <Link href={`/admin/omformulera/${set.id}`} className="inline-flex items-center gap-1 font-medium text-ocean hover:underline">
              <Icon name="formulera-om" size={16} />
              {rewordedSetIds.has(set.id) ? "Nya formuleringar (aktiva)" : "Formulera om frågorna"}
            </Link>
          </p>
        )}

        {shares.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {shares.map((share) => (
              <form
                key={share.id}
                action={unshareOfficialTestAction.bind(null, share.id, subjectId)}
              >
                <button
                  type="submit"
                  className="flex items-center gap-1 rounded-full bg-seafoam px-3 py-1 text-xs text-ocean-dark"
                  title="Sluta dela"
                >
                  {studentNameById.get(share.student_id) ?? "Okänd elev"} ✕
                </button>
              </form>
            ))}
          </div>
        )}

        {availableStudents.length > 0 ? (
          <form
            action={shareOfficialTestAction.bind(null, set.id, subjectId)}
            className="mt-3 flex items-center gap-2"
          >
            <select
              name="studentId"
              required
              defaultValue=""
              className="field-input flex-1"
            >
              <option value="" disabled>
                Välj elev...
              </option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary whitespace-nowrap">
              <Icon name="dela" />
              Dela
            </button>
          </form>
        ) : students?.length ? (
          <p className="mt-3 text-xs text-navy/40">Delat med alla dina elever.</p>
        ) : (
          <p className="mt-3 text-xs text-navy/40">
            Inga elever att dela med än.{" "}
            <Link href="/admin/elever/ny" className="underline">
              Lägg till en
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/testbibliotek" className="link-back">
        <Icon name="tillbaka" size={16} />
        Testbibliotek
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        {subject.name}
      </h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />

      {skrivovningar.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-navy">
            Skrivövningar
          </h2>
          <div className="mt-4 space-y-3">
            {skrivovningar.map((set) => (
              <TestRow key={set.id} set={set} />
            ))}
          </div>
        </section>
      )}

      {!onlyWriting && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-navy">
            Deltester
          </h2>
          <div className="mt-4 space-y-3">
            {deltester.length ? (
              deltester.map((set) => <TestRow key={set.id} set={set} />)
            ) : (
              <p className="text-navy/60">Inga deltester ännu.</p>
            )}
          </div>
        </section>
      )}

      {sluttest.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-navy">
            Sluttest
          </h2>
          <div className="mt-4 space-y-3">
            {sluttest.map((set) => (
              <TestRow key={set.id} set={set} />
            ))}
          </div>
        </section>
      )}
      <div className="h-32" aria-hidden="true" />
    </div>
  );
}
