"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getVariantForQuestion } from "@/lib/quiz/variants";
import { logEvent } from "@/lib/events/log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = ["test", "short", "mistakes", "mixed"] as const;
const SOURCES = ["testsida", "testkort", "rekommendation", "fortsatt"] as const;
type Mode = (typeof MODES)[number];
type Source = (typeof SOURCES)[number];

/**
 * Startar ett pass. Frågelistan sparas på passet (steg 0) så att ett
 * avbrutet pass går att återuppta och analysen vet vad eleven fick.
 */
export async function startAttemptAction(params: {
  studySetId: string;
  questionIds: string[];
  mode?: Mode;
  source?: Source;
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const questionIds = params.questionIds.filter((id) => UUID_RE.test(id)).slice(0, 50);
  const mode: Mode = MODES.includes(params.mode as Mode) ? (params.mode as Mode) : "test";
  const source: Source = SOURCES.includes(params.source as Source) ? (params.source as Source) : "testsida";

  const { data: attempt, error } = await supabase
    .from("attempts")
    .insert({
      student_id: profile.id,
      study_set_id: params.studySetId,
      total_questions: questionIds.length,
      question_ids: questionIds,
      mode,
      source,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !attempt) {
    throw new Error("Kunde inte starta testet");
  }

  await logEvent(supabase, "session_started", {
    sessionId: attempt.id,
    source,
    studySetId: params.studySetId,
    props: { mode, question_count: questionIds.length },
  });

  return attempt.id as string;
}

/**
 * Rätt svar valideras alltid server-side — klienten får aldrig
 * facit förrän efter att eleven svarat (sektion 43). Varje svar sparas
 * direkt med frågeversion, variant och kunskapspunkt (steg 0).
 */
export async function submitAnswerAction(params: {
  attemptId: string;
  questionId: string;
  selectedAnswer: string;
  responseTimeMs: number;
  /** Hoppa över: sparas separat och räknas inte som fel. */
  skipped?: boolean;
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const [{ data: question }, { data: attempt }] = await Promise.all([
    supabase
      .from("questions")
      .select("correct_answer, accepted_answers, explanation, knowledge_point_id, version")
      .eq("id", params.questionId)
      .maybeSingle(),
    supabase
      .from("attempts")
      .select("id, study_set_id, question_ids")
      .eq("id", params.attemptId)
      .eq("student_id", profile.id)
      .maybeSingle(),
  ]);

  if (!question || !attempt) {
    throw new Error("Frågan hittades inte");
  }

  // Omformulerad version (om föräldern aktiverat en): rätt svar och
  // förklaring kommer därifrån, men originalets svar godkänns också.
  const variant = await getVariantForQuestion(supabase, params.questionId);

  const skipped = params.skipped === true;
  const normalizedSelected = params.selectedAnswer.trim().toLowerCase();
  const asList = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  const acceptedList = [
    ...(variant ? [variant.correct_answer, ...asList(variant.accepted_answers)] : []),
    question.correct_answer,
    ...asList(question.accepted_answers),
  ].map((a) => a.trim().toLowerCase());
  const correct = skipped ? null : acceptedList.includes(normalizedSelected);
  const responseSeconds = Math.max(0, Math.round(params.responseTimeMs / 1000));

  await supabase.from("answers").upsert(
    {
      attempt_id: params.attemptId,
      question_id: params.questionId,
      selected_answer: skipped ? null : params.selectedAnswer,
      correct,
      response_time: responseSeconds,
      skipped,
      // Ingen ledtrådsfunktion finns ännu: alla svar räknas som utan hjälp.
      help_used: false,
      question_version: question.version ?? 1,
      variant_id: variant?.id ?? null,
      knowledge_point_id: question.knowledge_point_id ?? null,
    },
    { onConflict: "attempt_id,question_id", ignoreDuplicates: true },
  );
  await supabase.from("attempts").update({ last_activity_at: new Date().toISOString() }).eq("id", params.attemptId);

  const questionIds = (attempt.question_ids ?? []) as string[];
  const position = questionIds.indexOf(params.questionId) + 1;
  await logEvent(supabase, skipped ? "question_skipped" : "question_answered", {
    sessionId: params.attemptId,
    studySetId: attempt.study_set_id,
    knowledgePointId: question.knowledge_point_id,
    correct,
    helpUsed: false,
    props: {
      ...(position > 0 ? { position } : {}),
      question_version: question.version ?? 1,
      response_s: Math.min(responseSeconds, 3600),
    },
  });

  if (!skipped) {
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
  }

  return {
    correct: correct === true,
    correctAnswer: variant?.correct_answer ?? question.correct_answer,
    explanation: variant?.explanation ?? question.explanation,
  };
}

/** Avslutar passet. Poängen räknas från sparade svar, inte från webbläsaren. */
export async function finishAttemptAction(attemptId: string, _clientScore?: number) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, study_set_id, started_at, mode, source, total_questions, status")
    .eq("id", attemptId)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!attempt || attempt.status === "completed") return;

  const { data: rows } = await supabase.from("answers").select("correct, skipped").eq("attempt_id", attemptId);
  const score = (rows ?? []).filter((r) => r.correct === true).length;
  const now = new Date();

  await supabase
    .from("attempts")
    .update({ score, completed_at: now.toISOString(), status: "completed", last_activity_at: now.toISOString() })
    .eq("id", attemptId);

  await logEvent(supabase, "session_completed", {
    sessionId: attemptId,
    source: attempt.source,
    studySetId: attempt.study_set_id,
    props: {
      mode: attempt.mode,
      question_count: attempt.total_questions ?? 0,
      answered_count: (rows ?? []).length,
      duration_s: Math.max(0, Math.round((now.getTime() - Date.parse(attempt.started_at)) / 1000)),
    },
  });
}

/** Eleven avbröt passet. De svar som redan getts finns kvar. */
export async function abandonAttemptAction(attemptId: string) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, study_set_id, mode, source, total_questions, status, answers(count)")
    .eq("id", attemptId)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!attempt || attempt.status === "completed" || attempt.status === "abandoned") return;

  const now = new Date().toISOString();
  await supabase
    .from("attempts")
    .update({ status: "abandoned", abandoned_at: now, last_activity_at: now })
    .eq("id", attemptId);

  const answered = (attempt.answers as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
  await logEvent(supabase, "session_abandoned", {
    sessionId: attemptId,
    source: attempt.source,
    studySetId: attempt.study_set_id,
    props: { mode: attempt.mode, question_count: attempt.total_questions ?? 0, answered_count: answered },
  });
}

/** Eleven pausar passet. Svaren finns kvar och passet kan återupptas från startsidan. */
export async function pauseAttemptAction(attemptId: string) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, study_set_id, mode, source, total_questions, status, answers(count)")
    .eq("id", attemptId)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!attempt || attempt.status === "completed" || attempt.status === "abandoned") return;

  const now = new Date().toISOString();
  await supabase
    .from("attempts")
    .update({ status: "paused", paused_at: now, last_activity_at: now })
    .eq("id", attemptId);

  const answered = (attempt.answers as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
  await logEvent(supabase, "session_paused", {
    sessionId: attemptId,
    source: attempt.source,
    studySetId: attempt.study_set_id,
    props: { mode: attempt.mode, question_count: attempt.total_questions ?? 0, answered_count: answered },
  });
  revalidatePath("/elev");
}

/** Ett pausat pass öppnas igen. Samma pass-id, så det räknas som ett och samma pass. */
export async function resumeAttemptAction(attemptId: string) {
  const profile = await requireProfile("student");
  const supabase = createClient();
  await supabase
    .from("attempts")
    .update({ status: "active", last_activity_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("student_id", profile.id)
    .in("status", ["paused", "active"]);
}

/** "Avsluta passet" från startsidan: eleven vill inte fortsätta. Svaren finns kvar. */
export async function endPausedAttemptAction(attemptId: string) {
  await abandonAttemptAction(attemptId);
  revalidatePath("/elev");
}
