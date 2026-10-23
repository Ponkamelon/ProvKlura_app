import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QuizRunner } from "@/components/QuizRunner";
import {
  selectQuestions,
  shuffle,
  shuffleOptions,
  type ProgressInfo,
} from "@/lib/quiz/selection";
import { getVariantsForStudySet } from "@/lib/quiz/variants";
import { hasFeature } from "@/lib/features";
import { getPointStatuses } from "@/lib/knowledge/status";
import { selectShortRound } from "@/lib/quiz/shortRound";
import { loadResumedAttempt } from "@/lib/quiz/loadResumed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QuestionRow = {
  id: string;
  question: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "concept";
  answer_options: unknown;
  image_url?: string | null;
};

type ProgressRow = { question_id: string } & ProgressInfo;

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: { studySetId: string };
  searchParams: { length?: string; mode?: string; fortsatt?: string; runda?: string; kalla?: string };
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();
  const stepOne = await hasFeature(supabase, profile.id, "steg1");
  const canPause = stepOne || (await hasFeature(supabase, profile.id, "fortsatt"));
  const source = stepOne && (searchParams.kalla === "testkort" || searchParams.kalla === "rekommendation")
    ? searchParams.kalla
    : "testsida";

  // "Fortsätt där du var": samma pass, samma frågor i samma ordning.
  if (canPause && searchParams.fortsatt && UUID_RE.test(searchParams.fortsatt)) {
    const resumed = await loadResumedAttempt(supabase, profile.id, params.studySetId, searchParams.fortsatt);
    if (resumed) {
      return (
        <QuizRunner
          studySetId={params.studySetId}
          questions={resumed.questions}
          feedbackTiming={resumed.feedbackTiming}
          canRequestRenewal={resumed.mode !== "mistakes"}
          mode={resumed.mode}
          canPause
          resume={resumed.resume}
          showSummary={stepOne}
        />
      );
    }
  }

  // Frågor och elevens inställningar hämtas parallellt för snabbare start.
  const [{ data: questionRows }, { data: prefs }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question, question_type, answer_options, image_url")
      .eq("study_set_id", params.studySetId)
      .eq("status", "published"),
    supabase
      .from("student_preferences")
      .select("feedback_timing")
      .eq("student_id", profile.id)
      .maybeSingle(),
  ]);

  const allQuestions = (questionRows ?? []) as unknown as QuestionRow[];

  if (!allQuestions.length) {
    redirect(`/elev/plugga/${params.studySetId}`);
  }

  // Bara framstegen för just det här provets frågor behövs.
  const { data: progressData } = await supabase
    .from("question_progress")
    .select("question_id, mastery_level, last_answered")
    .eq("student_id", profile.id)
    .in(
      "question_id",
      allQuestions.map((q) => q.id),
    );
  const progressRows = (progressData ?? []) as unknown as ProgressRow[];

  const feedbackTiming =
    prefs?.feedback_timing === "end_of_test" ? "end_of_test" : "immediate";

  const progressMap = new Map<string, ProgressInfo>(
    progressRows.map((p): [string, ProgressInfo] => [
      p.question_id,
      { mastery_level: p.mastery_level, last_answered: p.last_answered },
    ]),
  );

  let pool = allQuestions;
  let mode: "test" | "short" | "mistakes" = searchParams.mode === "mistakes" ? "mistakes" : "test";

  if (stepOne && searchParams.runda === "kort" && searchParams.mode !== "mistakes") {
    // Kort runda: fem frågor enligt 2+2+1 (kravspec avsnitt 5).
    mode = "short";
    const [{ data: kpRows }, points, { data: lastRound }] = await Promise.all([
      supabase.from("questions").select("id, knowledge_point_id").in("id", allQuestions.map((q) => q.id)),
      getPointStatuses(supabase, [params.studySetId]),
      supabase
        .from("attempts")
        .select("question_ids")
        .eq("student_id", profile.id)
        .eq("study_set_id", params.studySetId)
        .eq("mode", "short")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const pointByQuestion = new Map<string, string | null>(
      (kpRows ?? []).map((r) => [r.id as string, (r.knowledge_point_id as string | null) ?? null]),
    );
    const ids = selectShortRound(
      allQuestions.map((q) => ({
        id: q.id,
        knowledge_point_id: pointByQuestion.get(q.id) ?? null,
        last_answered: progressMap.get(q.id)?.last_answered ?? null,
      })),
      points,
      ((lastRound?.question_ids ?? []) as string[]),
    );
    const byId = new Map(allQuestions.map((q) => [q.id, q]));
    pool = ids.map((id) => byId.get(id)).filter((q): q is QuestionRow => !!q);
  } else if (searchParams.mode === "mistakes") {
    pool = shuffle(
      pool.filter((q) => progressMap.get(q.id)?.mastery_level === "needs_practice"),
    );
    if (!pool.length) redirect(`/elev/plugga/${params.studySetId}`);
  } else {
    // Adaptivt urval ur hela poolen (sektion 46): tidigare fel får förtur,
    // otestat dras oftare än det eleven redan kan, och ordningen blandas.
    // "Hela testet" (length=alla) tar alla frågor i blandad ordning.
    const length = searchParams.length === "alla" ? pool.length : Number(searchParams.length) || 10;
    pool = selectQuestions(pool, progressMap, length);
  }

  // Har föräldern aktiverat nya formuleringar används de; frågor utan
  // omformulering visas som vanligt. Rättningen slår upp samma version.
  const { variants } = await getVariantsForStudySet(supabase, params.studySetId);

  const preparedQuestions = pool.map((q) => {
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
      studySetId={params.studySetId}
      questions={preparedQuestions}
      feedbackTiming={feedbackTiming}
      canRequestRenewal={mode === "test"}
      mode={mode}
      canPause={canPause}
      source={source}
      showSummary={stepOne}
    />
  );
}
