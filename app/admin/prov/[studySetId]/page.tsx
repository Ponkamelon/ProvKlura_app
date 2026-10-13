import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  publishQuestionAction,
  unpublishQuestionAction,
  deleteQuestionAction,
  publishAllReviewedAction,
  assignStudySetAction,
} from "@/app/actions/questions";
import {
  regenerateQuestionsAction,
  deleteStudySetAction,
} from "@/app/actions/studySets";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import type { Tables } from "@/lib/database.types";

// regenerateQuestionsAction (Försök igen) kör samma AI-anrop som kan ta
// 15–40 sekunder — samma anledning som i admin/prov/ny/page.tsx.
export const maxDuration = 60;

type StudySetWithChapter = Tables<"study_sets"> & {
  chapters: (Tables<"chapters"> & { subjects: Tables<"subjects"> | null }) | null;
};

const VERIFICATION_LABEL: Record<string, string> = {
  verified: "Hög säkerhet",
  needs_review: "Bör granskas",
  rejected: "Underkänd",
};

export default async function StudySetReviewPage({
  params,
}: {
  params: { studySetId: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: rawStudySet } = await supabase
    .from("study_sets")
    .select("*, chapters(*, subjects(*))")
    .eq("id", params.studySetId)
    .eq("admin_id", profile.id)
    .maybeSingle();

  if (!rawStudySet) {
    return <p className="text-navy/70">Hittade inte pluggprojektet.</p>;
  }

  const studySet = rawStudySet as unknown as StudySetWithChapter;

  const { data: myGuardianRows } = await supabase
    .from("student_guardians")
    .select("student_id")
    .eq("admin_id", profile.id);
  const myStudentIds = myGuardianRows?.map((g) => g.student_id) ?? [];

  const [{ data: questions }, { data: students }, { data: assignments }, { data: materials }] =
    await Promise.all([
      supabase
        .from("questions")
        .select("*")
        .eq("study_set_id", params.studySetId)
        .order("created_at"),
      myStudentIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, grade_level")
            .in("id", myStudentIds)
            .eq("role", "student")
            .order("display_name")
        : Promise.resolve({ data: [] as { id: string; display_name: string; grade_level: number }[] }),
      supabase.from("assignments").select("student_id").eq("study_set_id", params.studySetId),
      supabase
        .from("source_material")
        .select("*")
        .eq("study_set_id", params.studySetId)
        .order("created_at", { ascending: false }),
    ]);

  const assignedIds = new Set(assignments?.map((a) => a.student_id));
  const publishedCount = questions?.filter((q) => q.status === "published").length ?? 0;
  const highConfidenceDrafts =
    questions?.filter((q) => q.status === "draft" && q.verification_status === "verified") ?? [];
  const failedMaterial = materials?.find((m) => m.processing_status === "error");
  // "uploaded" = sparat men aldrig genererat än — t.ex. Del 2/3 av ett
  // uppdelat pluggprojekt som väntar på att admin öppnar det.
  const pendingMaterial = materials?.find((m) => m.processing_status === "uploaded");

  return (
    <div>
      <Link href="/admin/prov" className="text-sm text-navy/60 underline">
        ← Pluggprojekt
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-navy/50">
            {studySet.chapters?.subjects?.name} · {studySet.chapters?.title}
          </p>
          <h1 className="font-display text-3xl font-semibold text-navy">
            {studySet.title}
          </h1>
          <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
        </div>
        <form action={deleteStudySetAction.bind(null, params.studySetId)}>
          <ConfirmSubmitButton
            message={`Är du säker på att du vill ta bort "${studySet.title}"?\n\nAlla frågor, tilldelningar och elevernas resultat försvinner. Det går inte att ångra.`}
            pendingText="Tar bort..."
            className="text-xs text-navy/40 underline hover:text-coral"
            title="Tar bort pluggprojektet och alla dess frågor, tilldelningar och elevförsök permanent"
          >
            Ta bort pluggprojekt
          </ConfirmSubmitButton>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-navy/60">
        <span>Åk {studySet.grade_level}</span>
        {studySet.exam_date && <span>· Prov {studySet.exam_date}</span>}
        <span>· {questions?.length ?? 0} frågor skapade</span>
        <span>· {publishedCount} publicerade</span>
      </div>

      <section className="mt-6 notebook-card p-6">
        <h2 className="font-display text-xl font-semibold text-navy">Tilldela</h2>
        <p className="mt-1 text-sm text-navy/60">
          Publicerade frågor blir synliga för elever du tilldelar.
        </p>
        {students?.length ? (
          <form action={assignStudySetAction.bind(null, params.studySetId)} className="mt-4 space-y-2">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  name="studentIds"
                  value={s.id}
                  defaultChecked={assignedIds.has(s.id)}
                  className="h-4 w-4 rounded border-sand-deep"
                />
                {s.display_name} (Åk {s.grade_level})
              </label>
            ))}
            <button type="submit" className="btn-primary mt-2">
              Spara tilldelning
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-navy/60">
            Inga elever än.{" "}
            <Link href="/admin/elever/ny" className="text-ocean underline">
              Lägg till en
            </Link>
            .
          </p>
        )}
      </section>

      {failedMaterial && (
        <div className="mt-4 rounded-xl border border-coral bg-coral/10 p-4">
          <p className="text-sm font-medium text-coral-dark">
            Materialet kunde inte bearbetas till frågor.
          </p>
          <p className="mt-1 text-xs text-navy/60">
            Materialet är sparat — inget har gått förlorat. Vanliga orsaker:
            AI-tjänsten svarade oväntat, eller ANTHROPIC_API_KEY saknas i
            miljövariablerna.
          </p>
          <form
            action={regenerateQuestionsAction.bind(null, params.studySetId, failedMaterial.id)}
            className="mt-3"
          >
            <SubmitButton pendingText="Genererar frågor..." className="btn-secondary">
              Försök igen
            </SubmitButton>
          </form>
        </div>
      )}

      {pendingMaterial && (
        <div className="mt-4 rounded-xl border border-turquoise bg-seafoam p-4">
          <p className="text-sm font-medium text-navy">
            Materialet är sparat men frågorna är inte genererade än.
          </p>
          <p className="mt-1 text-xs text-navy/60">
            Det här blev ett eget delprov eftersom materialet var stort —
            klicka nedan när du är redo att generera frågor för den här
            delen.
          </p>
          <form
            action={regenerateQuestionsAction.bind(null, params.studySetId, pendingMaterial.id)}
            className="mt-3"
          >
            <SubmitButton pendingText="Genererar frågor..." className="btn-primary">
              Generera frågor
            </SubmitButton>
          </form>
        </div>
      )}

      {highConfidenceDrafts.length > 0 && (
        <form action={publishAllReviewedAction.bind(null, params.studySetId)} className="mt-4">
          <button type="submit" className="btn-primary">
            Godkänn alla med hög säkerhet ({highConfidenceDrafts.length})
          </button>
        </form>
      )}

      <section className="mt-8 space-y-3">
        {questions?.length === 0 && !failedMaterial && !pendingMaterial && (
          <p className="text-navy/60">
            Inga frågor genererades ännu. Ge det en stund, eller lägg till mer
            material.
          </p>
        )}

        {questions?.map((q) => {
          const options = Array.isArray(q.answer_options)
            ? (q.answer_options as string[])
            : null;

          return (
            <div key={q.id} className="notebook-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {q.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.image_url}
                      alt=""
                      className="mb-2 max-h-24 w-auto rounded-lg border border-sand-deep bg-white object-contain"
                    />
                  )}
                  <p className="font-medium text-navy">{q.question}</p>

                  {options ? (
                    <ul className="mt-2 space-y-1 text-sm text-navy/70">
                      {options.map((opt, i) => (
                        <li
                          key={i}
                          className={
                            opt === q.correct_answer ? "font-semibold text-ocean-dark" : ""
                          }
                        >
                          {opt}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-ocean-dark">
                      Rätt svar: {q.correct_answer}
                    </p>
                  )}

                  {q.explanation && (
                    <p className="mt-2 text-xs text-navy/50">{q.explanation}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 text-xs">
                  <span
                    className={
                      "whitespace-nowrap rounded-full px-2 py-1 font-medium " +
                      (q.verification_status === "verified"
                        ? "bg-seafoam text-ocean-dark"
                        : q.verification_status === "rejected"
                          ? "bg-coral/10 text-coral-dark"
                          : "bg-sun/20 text-navy/70")
                    }
                  >
                    {VERIFICATION_LABEL[q.verification_status]} (
                    {Math.round((q.confidence_score ?? 0) * 100)}%)
                  </span>
                  <span className="text-navy/40">
                    {q.status === "published" ? "Publicerad" : "Utkast"}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <Link
                  href={`/admin/prov/${params.studySetId}/fraga/${q.id}`}
                  className="text-ocean underline"
                >
                  Redigera
                </Link>
                {q.status === "published" ? (
                  <form action={unpublishQuestionAction.bind(null, params.studySetId, q.id)}>
                    <button type="submit" className="text-navy/50 underline">
                      Dra tillbaka
                    </button>
                  </form>
                ) : (
                  <form action={publishQuestionAction.bind(null, params.studySetId, q.id)}>
                    <button type="submit" className="text-ocean underline">
                      Publicera
                    </button>
                  </form>
                )}
                <form action={deleteQuestionAction.bind(null, params.studySetId, q.id)}>
                  <button type="submit" className="text-coral underline">
                    Ta bort
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </section>

    </div>
  );
}
