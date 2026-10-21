import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Medal, medalForPercent } from "@/components/Medal";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { getUpdatedStudySetIds } from "@/lib/quiz/variants";
import type { Tables } from "@/lib/database.types";

type StudySetWithChapter = Tables<"study_sets"> & {
  chapters: { title: string; subjects: { name: string } | null } | null;
};

export default async function QuizStartPage({
  params,
}: {
  params: { studySetId: string };
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: rawStudySet } = await supabase
    .from("study_sets")
    .select("*, chapters(title, subjects(name))")
    .eq("id", params.studySetId)
    .maybeSingle();

  if (!rawStudySet) {
    return <p className="text-navy/70">Hittade inte pluggprojektet.</p>;
  }

  const studySet = rawStudySet as unknown as StudySetWithChapter;

  const { count: publishedCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("study_set_id", params.studySetId)
    .eq("status", "published");

  const { data: progressRows } = await supabase
    .from("question_progress")
    .select("question_id")
    .eq("student_id", profile.id)
    .eq("mastery_level", "needs_practice");

  const total = publishedCount ?? 0;
  const lengthOptions = [
    { length: 5, label: "Snabbtest" },
    { length: 10, label: "Test" },
    { length: 20, label: "Längre test" },
  ].filter((o) => o.length <= Math.max(total, 5));

  const needsPracticeCount = progressRows?.length ?? 0;

  const { data: attempts } = await supabase
    .from("attempts")
    .select("score, total_questions, completed_at")
    .eq("student_id", profile.id)
    .eq("study_set_id", params.studySetId)
    .not("completed_at", "is", null);

  let bestPercent: number | null = null;
  for (const a of attempts ?? []) {
    if (!a.total_questions || a.score === null) continue;
    const percent = Math.round((a.score / a.total_questions) * 100);
    if (bestPercent === null || percent > bestPercent) bestPercent = percent;
  }
  const tier = bestPercent !== null ? medalForPercent(bestPercent) : null;

  const isUpdated = (await getUpdatedStudySetIds(supabase, profile.id, [params.studySetId])).has(
    params.studySetId,
  );

  if (!total) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold text-navy">
          {studySet.title}
        </h1>
        <p className="mt-4 text-navy/70">
          Inga frågor är redo än. Kolla igen lite senare.
        </p>
        <Link href="/elev" className="mt-4 inline-block text-sm text-navy/50 underline">
          ← Tillbaka
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/elev" className="text-sm text-navy/50 underline">
        ← Tillbaka
      </Link>
      <p className="mt-3 text-xs text-navy/50">{studySet.chapters?.subjects?.name}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-navy">
          {studySet.title}
        </h1>
        {tier && (
          <div className="shrink-0 text-center">
            <Medal tier={tier} size={44} />
            <p className="mt-0.5 font-mono text-xs text-navy/50">{bestPercent}%</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-navy/60">{total} frågor redo</p>

      {isUpdated && (
        <div className="mt-4 rounded-xl border border-sun bg-sun/15 p-4">
          <UpdatedBadge />
          <p className="mt-2 text-sm text-navy">
            Frågorna har fått nya formuleringar. Samma kunskap, nya ord — precis som det kan låta
            på ett riktigt prov.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {lengthOptions.map((o) => (
          <Link
            key={o.length}
            href={`/elev/plugga/${params.studySetId}/quiz?length=${o.length}`}
            className="notebook-card flex items-center justify-between p-4"
          >
            <span className="font-medium text-navy">{o.label}</span>
            <span className="text-sm text-navy/50">{o.length} frågor</span>
          </Link>
        ))}

        {needsPracticeCount > 0 && (
          <Link
            href={`/elev/plugga/${params.studySetId}/quiz?mode=mistakes`}
            className="notebook-card flex items-center justify-between border-2 border-coral p-4"
          >
            <span className="font-medium text-navy">Träna mina fel</span>
            <span className="text-sm text-coral">{needsPracticeCount} frågor</span>
          </Link>
        )}
      </div>
    </div>
  );
}
