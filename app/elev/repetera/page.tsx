import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuizRunner } from "@/components/QuizRunner";
import { hasFeature } from "@/lib/features";
import { getPointStatuses } from "@/lib/knowledge/status";
import { getStudentQuizSets } from "@/lib/quiz/studentSets";
import { selectMixedRound } from "@/lib/quiz/mixedRound";
import { shuffle, shuffleOptions } from "@/lib/quiz/selection";
import { getVariantsForStudySet, type QuestionVariant } from "@/lib/quiz/variants";
import { loadResumedAttempt } from "@/lib/quiz/loadResumed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QuestionRow = {
  id: string;
  study_set_id: string;
  knowledge_point_id: string | null;
  question: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "concept";
  answer_options: unknown;
  image_url: string | null;
};

/**
 * Repetera blandat (kravspec avsnitt 4): en kort runda med frågor från
 * flera av elevens test, om saker hen tränat och som är dags att fräscha upp.
 */
export default async function RepeteraPage({ searchParams }: { searchParams: { fortsatt?: string } }) {
  const profile = await requireProfile("student");
  const supabase = createClient();
  if (!(await hasFeature(supabase, profile.id, "steg1"))) redirect("/elev");

  if (searchParams.fortsatt && UUID_RE.test(searchParams.fortsatt)) {
    const resumed = await loadResumedAttempt(supabase, profile.id, null, searchParams.fortsatt);
    if (resumed) {
      return (
        <QuizRunner
          studySetId={null}
          questions={resumed.questions}
          feedbackTiming={resumed.feedbackTiming}
          canRequestRenewal={false}
          mode="mixed"
          canPause
          resume={resumed.resume}
          source="rekommendation"
          showSummary
        />
      );
    }
  }

  const sets = await getStudentQuizSets(supabase, profile.id);
  const setIds = sets.map((s) => s.id);
  const [points, { data: rows }, { data: prefs }] = await Promise.all([
    getPointStatuses(supabase, setIds),
    setIds.length
      ? supabase
          .from("questions")
          .select("id, study_set_id, knowledge_point_id, question, question_type, answer_options, image_url")
          .in("study_set_id", setIds)
          .eq("status", "published")
      : Promise.resolve({ data: [] }),
    supabase.from("student_preferences").select("feedback_timing").eq("student_id", profile.id).maybeSingle(),
  ]);
  const questions = (rows ?? []) as unknown as QuestionRow[];

  const { data: progress } = questions.length
    ? await supabase
        .from("question_progress")
        .select("question_id, last_answered")
        .eq("student_id", profile.id)
        .in("question_id", questions.map((q) => q.id))
    : { data: [] as { question_id: string; last_answered: string | null }[] };
  const lastAnswered = new Map<string, string | null>(
    (progress ?? []).map((p) => [p.question_id as string, (p.last_answered as string | null) ?? null]),
  );

  const ids = selectMixedRound(
    points,
    questions.map((q) => ({ ...q, last_answered: lastAnswered.get(q.id) ?? null })),
  );
  if (!ids.length) redirect("/elev");

  const byId = new Map(questions.map((q) => [q.id, q]));
  const picked = shuffle(ids.map((id) => byId.get(id)).filter((q): q is QuestionRow => !!q));

  const variants = new Map<string, QuestionVariant>();
  for (const setId of [...new Set(picked.map((q) => q.study_set_id))]) {
    const { variants: forSet } = await getVariantsForStudySet(supabase, setId);
    for (const [qid, v] of forSet) variants.set(qid, v);
  }

  const prepared = picked.map((q) => {
    const variant = variants.get(q.id);
    const options = variant?.answer_options ?? q.answer_options;
    return {
      id: q.id,
      question: variant?.question ?? q.question,
      question_type: q.question_type,
      answer_options: Array.isArray(options) ? shuffleOptions(options as string[]) : null,
      image_url: q.image_url ?? null,
    };
  });

  return (
    <QuizRunner
      studySetId={null}
      questions={prepared}
      feedbackTiming={prefs?.feedback_timing === "end_of_test" ? "end_of_test" : "immediate"}
      canRequestRenewal={false}
      mode="mixed"
      canPause
      source="rekommendation"
      showSummary
    />
  );
}
