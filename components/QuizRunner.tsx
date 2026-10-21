"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startAttemptAction,
  submitAnswerAction,
  finishAttemptAction,
} from "@/app/actions/quiz";
import { Medal, medalForPercent } from "@/components/Medal";
import { Icon } from "@/components/Icon";

type QuizQuestion = {
  id: string;
  question: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "concept";
  answer_options: string[] | null;
  image_url?: string | null;
};

type Feedback = {
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
};

type AnsweredRecord = QuizQuestion & Feedback & { selectedAnswer: string };

export function QuizRunner({
  studySetId,
  questions,
  feedbackTiming = "immediate",
}: {
  studySetId: string;
  questions: QuizQuestion[];
  feedbackTiming?: "immediate" | "end_of_test";
}) {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answered, setAnswered] = useState<AnsweredRecord[]>([]);
  const router = useRouter();

  // Ref istället för bara state för den l\u00f6pande po\u00e4ngen: i "efter test"-
  // l\u00e4get sker r\u00e4ttning och avancering i samma klick, och d\u00e5 hinner React
  // inte alltid f\u00e4rdigst\u00e4lla en state-uppdatering innan v\u00e4rdet l\u00e4ses igen.
  const correctCountRef = useRef(0);

  const current = questions[index];
  const showImmediateFeedback = feedbackTiming === "immediate";
  const isLastQuestion = index + 1 >= questions.length;

  useEffect(() => {
    startAttemptAction(studySetId, questions.length)
      .then(setAttemptId)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStartedAt(Date.now());
  }, [index]);

  async function recordAnswer(): Promise<Feedback | null> {
    if (!attemptId || !selected) return null;

    const result = await submitAnswerAction({
      attemptId,
      questionId: current.id,
      selectedAnswer: selected,
      responseTimeMs: Date.now() - startedAt,
    });

    if (result.correct) correctCountRef.current += 1;
    setAnswered((a) => [...a, { ...current, ...result, selectedAnswer: selected }]);
    return result;
  }

  async function advance() {
    if (isLastQuestion) {
      if (attemptId) await finishAttemptAction(attemptId, correctCountRef.current);
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected("");
    setFeedback(null);
  }

  async function handlePrimaryAction() {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      if (showImmediateFeedback) {
        if (!feedback) {
          const result = await recordAnswer();
          setFeedback(result);
        } else {
          await advance();
        }
      } else {
        await recordAnswer();
        await advance();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    const hasProgress = answered.length > 0 || selected;
    if (
      hasProgress &&
      !window.confirm("Vill du avbryta? Det du redan svarat sparas inte.")
    ) {
      return;
    }
    router.push(`/elev/plugga/${studySetId}`);
  }

  if (loading) {
    return <p className="text-center text-navy/50">Laddar...</p>;
  }

  if (finished) {
    const percent = Math.round((correctCountRef.current / questions.length) * 100);
    const tier = medalForPercent(percent);
    return (
      <div>
        <div className="text-center">
          {tier && <Medal tier={tier} />}
          <p className="mt-2 font-display text-5xl font-semibold text-navy">
            {correctCountRef.current} / {questions.length}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-ocean">
            {percent}%
          </p>
          <p className="mt-4 text-navy/70">
            {percent >= 70
              ? "Bra koll! Repetera det du missade när du vill. 🎉"
              : "Bra jobbat — fortsätt träna det svåra."}
          </p>
        </div>

        {!showImmediateFeedback && answered.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="font-display text-lg font-semibold text-navy">
              Genomgång
            </h2>
            {answered.map((a, i) => (
              <div
                key={i}
                className={
                  "notebook-card p-4" + (a.correct ? "" : " border-2 border-coral")
                }
              >
                <p className="text-sm font-medium text-navy">{a.question}</p>
                <p
                  className={
                    "mt-1 text-sm " +
                    (a.correct ? "text-ocean-dark" : "text-coral-dark")
                  }
                >
                  {a.correct ? "Rätt ✓" : `Fel — rätt svar: ${a.correctAnswer}`}
                </p>
                {a.explanation && (
                  <p className="mt-1 text-xs text-navy/50">{a.explanation}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href={`/elev/plugga/${studySetId}`}
            className="btn-primary inline-flex"
          >
            Klar
          </Link>
        </div>
      </div>
    );
  }

  const buttonLabel = showImmediateFeedback
    ? feedback
      ? isLastQuestion
        ? "Se resultat"
        : "Nästa fråga"
      : "Svara"
    : isLastQuestion
      ? "Se resultat"
      : "Nästa fråga";

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleCancel}
          className="link-back text-navy/60"
        >
          <Icon name="avbryt" size={16} />
          Avbryt
        </button>
        <p className="font-mono text-sm text-navy/50">
          {index + 1} / {questions.length}
        </p>
        <span className="w-12" />
      </div>

      <div className="notebook-card mt-4 p-6">
        {current.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.image_url}
            alt=""
            className="mx-auto mb-4 max-h-64 w-auto rounded-xl border border-sand-deep bg-white object-contain"
          />
        )}
        <p className="text-lg font-medium text-navy">{current.question}</p>

        <div className="mt-6 space-y-2">
          {current.question_type === "multiple_choice" &&
            current.answer_options?.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={!!feedback}
                onClick={() => setSelected(opt)}
                className={
                  "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors " +
                  (feedback
                    ? opt === feedback.correctAnswer
                      ? "border-turquoise bg-seafoam"
                      : opt === selected
                        ? "border-coral bg-coral/10"
                        : "border-sand-deep opacity-60"
                    : opt === selected
                      ? "border-ocean bg-ocean/5"
                      : "border-sand-deep hover:border-ocean")
                }
              >
                {opt}
              </button>
            ))}

          {current.question_type === "true_false" &&
            ["Sant", "Falskt"].map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={!!feedback}
                onClick={() => setSelected(opt)}
                className={
                  "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors " +
                  (feedback
                    ? opt === feedback.correctAnswer
                      ? "border-turquoise bg-seafoam"
                      : opt === selected
                        ? "border-coral bg-coral/10"
                        : "border-sand-deep opacity-60"
                    : opt === selected
                      ? "border-ocean bg-ocean/5"
                      : "border-sand-deep hover:border-ocean")
                }
              >
                {opt}
              </button>
            ))}

          {(current.question_type === "short_answer" ||
            current.question_type === "concept") && (
            <input
              type="text"
              value={selected}
              disabled={!!feedback}
              onChange={(e) => setSelected(e.target.value)}
              className="field-input"
              placeholder="Skriv ditt svar"
            />
          )}
        </div>

        {feedback && showImmediateFeedback && (
          <div
            className={
              "mt-4 rounded-xl p-3 text-sm " +
              (feedback.correct
                ? "bg-seafoam text-ocean-dark"
                : "bg-coral/10 text-coral-dark")
            }
          >
            <p className="font-semibold">
              {feedback.correct ? "Rätt ✓" : "Inte riktigt"}
            </p>
            {!feedback.correct && <p>Rätt svar: {feedback.correctAnswer}</p>}
            {feedback.explanation && (
              <p className="mt-1 text-navy/70">{feedback.explanation}</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={!selected || submitting}
            className="btn-primary w-full disabled:opacity-40"
          >
            {submitting ? "..." : buttonLabel}
            {!submitting && buttonLabel === "Nästa fråga" && <Icon name="nasta" />}
          </button>
        </div>
      </div>
    </div>
  );
}
