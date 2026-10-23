import { createClient } from "@/lib/supabase/server";
import { shuffleOptions } from "@/lib/quiz/selection";
import { getVariantsForStudySet, type QuestionVariant } from "@/lib/quiz/variants";

type Client = ReturnType<typeof createClient>;
type Mode = "test" | "short" | "mistakes" | "mixed";
type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "concept";

type Row = {
  id: string;
  study_set_id: string;
  question: string;
  question_type: QuestionType;
  answer_options: unknown;
  image_url: string | null;
  correct_answer: string;
  explanation: string | null;
};

/**
 * Laddar ett pausat pass: frågelistan i samma ordning, de svar som redan
 * getts och vilken typ passet var. studySetId = null för blandad repetition.
 */
export async function loadResumedAttempt(
  supabase: Client,
  studentId: string,
  studySetId: string | null,
  attemptId: string,
) {
  let query = supabase
    .from("attempts")
    .select("id, study_set_id, question_ids, mode, status, completed_at")
    .eq("id", attemptId)
    .eq("student_id", studentId);
  query = studySetId ? query.eq("study_set_id", studySetId) : query.is("study_set_id", null);
  const { data: attempt } = await query.maybeSingle();
  if (!attempt || attempt.completed_at || !["paused", "active"].includes(attempt.status)) return null;
  const ids = (attempt.question_ids ?? []) as string[];
  if (!ids.length) return null;

  const [{ data: rows }, { data: answers }, { data: prefs }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, study_set_id, question, question_type, answer_options, image_url, correct_answer, explanation")
      .in("id", ids),
    supabase
      .from("answers")
      .select("question_id, selected_answer, correct, skipped, created_at")
      .eq("attempt_id", attempt.id)
      .order("created_at"),
    supabase.from("student_preferences").select("feedback_timing").eq("student_id", studentId).maybeSingle(),
  ]);

  const byId = new Map(((rows ?? []) as unknown as Row[]).map((q) => [q.id, q]));
  const ordered = ids.map((id) => byId.get(id)).filter((q): q is Row => !!q);

  // Föräldrarnas omformuleringar, per test som passet hämtar frågor från.
  const variants = new Map<string, QuestionVariant>();
  for (const setId of [...new Set(ordered.map((q) => q.study_set_id))]) {
    const { variants: forSet } = await getVariantsForStudySet(supabase, setId);
    for (const [qid, v] of forSet) variants.set(qid, v);
  }

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
