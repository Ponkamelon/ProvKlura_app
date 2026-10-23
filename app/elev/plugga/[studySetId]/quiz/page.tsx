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
  searchParams: { length?: string; mode?: string; fortsatt?: string };
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();
  const canPause = await hasFeature(supabase, profile.id, "fortsatt");

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

  if (searchParams.mode === "mistakes") {
    pool = shuffle(
      pool.filter((q) => progressMap.get(q.id)?.mastery_level === "needs_practice"),
    );
    if (!pool.length) redirect(`/elev/plugga/${params.studySetId}`);
  } else {
    // Adaptivt urval ur hela poolen (sektion 46): tidigare fel får förtur,
    // otestat dras oftare än det eleven redan kan, och ordningen blandas.
    const length = Number(searchParams.length) || 10;
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
      canRequestRenewal={searchParams.mode !== "mistakes"}
      mode={searchParams.mode === "mistakes" ? "mistakes" : "test"}
      canPause={canPause}
    />
  );
}

type Client = ReturnType<typeof createClient>;
type Mode = "test" | "short" | "mistakes" | "mixed";

/** Laddar ett pausat pass: frågelistan, de svar som redan getts och poängen hittills. */
async function loadResumedAttempt(supabase: Client, studentId: string, studySetId: string, attemptId: string) {
  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, study_set_id, question_ids, mode, status, completed_at")
    .eq("id", attemptId)
    .eq("student_id", studentId)
    .eq("study_set_id", studySetId)
    .maybeSingle();
  if (!attempt || attempt.completed_at || !["paused", "active"].includes(attempt.status)) return null;
  const ids = (attempt.question_ids ?? []) as string[];
  if (!ids.length) return null;

  const [{ data: rows }, { data: answers }, { data: prefs }, { variants }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question, question_type, answer_options, image_url, correct_answer, explanation")
      .in("id", ids),
    supabase
      .from("answers")
      .select("question_id, selected_answer, correct, skipped, created_at")
      .eq("attempt_id", attempt.id)
      .order("created_at"),
    supabase.from("student_preferences").select("feedback_timing").eq("student_id", studentId).maybeSingle(),
    getVariantsForStudySet(supabase, studySetId),
  ]);

  type Row = QuestionRow & { correct_answer: string; explanation: string | null };
  const byId = new Map(((rows ?? []) as unknown as Row[]).map((q) => [q.id, q]));
  const ordered = ids.map((id) => byId.get(id)).filter((q): q is Row => !!q);

  const questions = ordered.map((q) => {
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
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const answered = (answers ?? [])
    .filter((a) => questionById.has(a.question_id))
    .map((a) => {
      const q = byId.get(a.question_id)!;
      const variant = variants.get(a.question_id);
      return {
        ...questionById.get(a.question_id)!,
        correct: a.correct === true,
        correctAnswer: variant?.correct_answer ?? q.correct_answer,
        explanation: variant?.explanation ?? q.explanation,
        selectedAnswer: a.selected_answer ?? "",
      };
    });

  const mode: Mode = (["test", "short", "mistakes", "mixed"] as const).includes(attempt.mode as Mode)
    ? (attempt.mode as Mode)
    : "test";

  return {
    questions,
    mode,
    feedbackTiming: (prefs?.feedback_timing === "end_of_test" ? "end_of_test" : "immediate") as
      | "end_of_test"
      | "immediate",
    resume: { attemptId: attempt.id as string, answered },
  };
}
