"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVariantForQuestion } from "@/lib/quiz/variants";

/**
 * Rätt svar valideras alltid server-side — klienten får aldrig
 * facit förrän efter att eleven svarat (sektion 43).
 */
export async function startAttemptAction(studySetId: string, totalQuestions: number) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: attempt, error } = await supabase
    .from("attempts")
    .insert({
      student_id: profile.id,
      study_set_id: studySetId,
      total_questions: totalQuestions,
    })
    .select()
    .single();

  if (error || !attempt) {
    throw new Error("Kunde inte starta testet");
  }

  return attempt.id;
}

export async function submitAnswerAction(params: {
  attemptId: string;
  questionId: string;
  selectedAnswer: string;
  responseTimeMs: number;
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("correct_answer, accepted_answers, explanation")
    .eq("id", params.questionId)
    .maybeSingle();

  if (!question) {
    throw new Error("Frågan hittades inte");
  }

  // Omformulerad version (om föräldern aktiverat en): rätt svar och
  // förklaring kommer därifrån, men originalets svar godkänns också.
  const variant = await getVariantForQuestion(supabase, params.questionId);

  const normalizedSelected = params.selectedAnswer.trim().toLowerCase();
  const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const acceptedList = [
    ...(variant ? [variant.correct_answer, ...asList(variant.accepted_answers)] : []),
    question.correct_answer,
    ...asList(question.accepted_answers),
  ].map((a) => a.trim().toLowerCase());
  const correct = acceptedList.includes(normalizedSelected);

  await supabase.from("answers").insert({
    attempt_id: params.attemptId,
    question_id: params.questionId,
    selected_answer: params.selectedAnswer,
    correct,
    response_time: Math.round(params.responseTimeMs / 1000),
  });

  const { data: progress } = await supabase
    .from("question_progress")
    .select("*")
    .eq("student_id", profile.id)
    .eq("question_id", params.questionId)
    .maybeSingle();

  const nextCorrect = (progress?.correct_count ?? 0) + (correct ? 1 : 0);
  const nextIncorrect = (progress?.incorrect_count ?? 0) + (correct ? 0 : 1);
  const nextAttempts = (progress?.attempts ?? 0) + 1;

  // Enkel tregradig mastery (sektion 45): fel -> behöver tränas,
  // två rätt i rad utan fel -> sitter, annars på gång.
  let masteryLevel: "needs_practice" | "learning" | "mastered" = "learning";
  if (!correct) {
    masteryLevel = "needs_practice";
  } else if (nextCorrect >= 2 && nextIncorrect === 0) {
    masteryLevel = "mastered";
  }

  await supabase.from("question_progress").upsert(
    {
      student_id: profile.id,
      question_id: params.questionId,
      attempts: nextAttempts,
      correct_count: nextCorrect,
      incorrect_count: nextIncorrect,
      mastery_level: masteryLevel,
      last_answered: new Date().toISOString(),
    },
    { onConflict: "student_id,question_id" },
  );

  return {
    correct,
    correctAnswer: variant?.correct_answer ?? question.correct_answer,
    explanation: variant?.explanation ?? question.explanation,
  };
}

export async function finishAttemptAction(attemptId: string, score: number) {
  await requireProfile("student");
  const supabase = createClient();
  await supabase
    .from("attempts")
    .update({ score, completed_at: new Date().toISOString() })
    .eq("id", attemptId);
}
