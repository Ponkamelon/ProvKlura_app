"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { saveNutidAnswersAction } from "@/app/actions/nutid";
import { SIGNS, type StudentQuestion } from "@/lib/nutid/types";

/**
 * Nutidskrysset som en tipskupong: en fråga i taget, tre alternativ
 * (1, X, 2), svar direkt. Svaren sparas efter varje fråga så eleven kan
 * pausa och fortsätta senare.
 */
export function NutidQuiz({
  kryssId,
  title,
  questions,
  initialAnswers,
  isNews,
}: {
  kryssId: string;
  title: string;
  questions: StudentQuestion[];
  initialAnswers: (number | null)[];
  isNews: boolean;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    questions.map((_, i) => {
      const a = initialAnswers[i];
      return a === 0 || a === 1 || a === 2 ? a : null;
    }),
  );
  const firstOpen = answers.findIndex((a) => a === null);
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const [revealed, setRevealed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const done = index >= questions.length;
  const correctCount = answers.filter((a, i) => a !== null && a === questions[i].correct).length;

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  function choose(option: number) {
    if (revealed || done) return;
    const next = [...answers];
    next[index] = option;
    setAnswers(next);
    setRevealed(true);
    void saveNutidAnswersAction({ kryssId, answers: next }).catch(() => {
      // Sparas igen vid nästa svar — eleven ska inte märka något.
    });
  }

  function goNext() {
    setRevealed(false);
    setIndex((i) => i + 1);
    window.scrollTo({ top: 0 });
  }

  const progress = Math.round((Math.min(index, questions.length) / questions.length) * 100);

  return (
    <div data-nutid>
      <div className="flex items-center justify-between gap-3">
        <Link href="/elev/nutid" className="text-sm text-navy/60 underline">
          ← {done ? "Nutidskrysset" : "Pausa"}
        </Link>
        <span className="nutid-badge">{title}</span>
      </div>

      <Kupong questions={questions} answers={answers} current={done ? -1 : index} />

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Hur långt du har kommit"
      >
        <div className="h-full rounded-full bg-press transition-all" style={{ width: `${progress}%` }} />
      </div>

      {!done ? (
        <QuestionCard
          headingRef={headingRef}
          number={index + 1}
          total={questions.length}
          q={questions[index]}
          chosen={answers[index]}
          revealed={revealed}
          onChoose={choose}
          onNext={goNext}
          isLast={index + 1 >= questions.length}
        />
      ) : (
        <div className="nutid-card mt-5 p-5">
          <p className="font-accent text-2xl font-bold text-press">Klart!</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold text-navy outline-none">
            Du fick {correctCount} av {questions.length} rätt
          </h2>
          <p className="mt-2 text-navy/80">
            {correctCount === questions.length
              ? "Full pott! Du har riktigt bra koll på veckan."
              : correctCount >= questions.length / 2
                ? "Snyggt! Du har bra koll på vad som händer."
                : "Bra att du var med. Nu vet du mer om veckan än i morse."}
          </p>

          <ul className="mt-5 space-y-3">
            {questions.map((q, i) => {
              const a = answers[i];
              const right = a === q.correct;
              return (
                <li key={i} className="rounded-xl bg-white p-3">
                  <p className="text-sm font-medium text-navy">
                    {i + 1}. {q.question}
                  </p>
                  <p className={`mt-1 text-sm ${right ? "text-ocean-dark" : "text-navy/80"}`}>
                    {right ? "✓ " : ""}
                    <span className="font-mono font-semibold">{SIGNS[q.correct]}</span> {q.options[q.correct]}
                    {!right && a !== null && (
                      <span className="text-navy/50"> · du svarade {SIGNS[a]}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>

          {isNews && (
            <p className="mt-4 text-sm text-navy/70">
              Alla frågor bygger på nyheter som fanns hos minst två olika nyhetsredaktioner.
            </p>
          )}
          <Link href="/elev/nutid" className="btn-primary mt-6 w-full">
            Se din nyhetskoll
          </Link>
        </div>
      )}
    </div>
  );
}

/** Raden med tio rutor överst, som på en tipskupong. */
function Kupong({
  questions,
  answers,
  current,
}: {
  questions: StudentQuestion[];
  answers: (number | null)[];
  current: number;
}) {
  return (
    <ol className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }} aria-label="Din kupong">
      {questions.map((q, i) => {
        const a = answers[i];
        const answered = a !== null;
        const right = answered && a === q.correct;
        return (
          <li
            key={i}
            aria-current={i === current ? "step" : undefined}
            className={`flex aspect-square items-center justify-center rounded-md border font-mono text-sm font-semibold ${
              i === current
                ? "border-press bg-press-soft text-press-dark"
                : answered
                  ? right
                    ? "border-ocean/40 bg-seafoam text-ocean-dark"
                    : "border-navy/20 bg-white text-navy/60"
                  : "border-navy/15 bg-white/70 text-navy/30"
            }`}
          >
            <span aria-hidden="true">{answered ? SIGNS[a] : i + 1}</span>
            <span className="sr-only">
              Fråga {i + 1}: {answered ? `svarat ${SIGNS[a]}, ${right ? "rätt" : "fel"}` : "inte svarat"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function QuestionCard({
  headingRef,
  number,
  total,
  q,
  chosen,
  revealed,
  onChoose,
  onNext,
  isLast,
}: {
  headingRef: React.MutableRefObject<HTMLHeadingElement | null>;
  number: number;
  total: number;
  q: StudentQuestion;
  chosen: number | null;
  revealed: boolean;
  onChoose: (option: number) => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const wasRight = chosen === q.correct;

  return (
    <div className="nutid-card mt-5 p-5">
      <p className="font-accent text-xl font-bold leading-none text-press">
        Fråga {number} av {total}
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-xl font-semibold leading-snug text-navy outline-none">
        {q.question}
      </h2>
      {q.sourceNames.length > 0 && (
        <p className="mt-2 text-sm text-navy/60">Nyheten fanns hos: {q.sourceNames.join(", ")}</p>
      )}

      <div className="mt-5 space-y-3">
        {q.options.map((option, i) => {
          const isChosen = chosen === i && revealed;
          const isCorrect = i === q.correct;
          let tone = "border-navy/15 bg-white hover:border-press";
          if (revealed && isCorrect) tone = "border-ocean bg-seafoam";
          else if (isChosen) tone = "border-navy/30 bg-sand/50";
          else if (revealed) tone = "border-navy/10 bg-white opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={revealed}
              onClick={() => onChoose(i)}
              className={`nutid-option ${tone}`}
            >
              <span className={`nutid-sign ${revealed && isCorrect ? "bg-ocean text-white" : ""}`}>{SIGNS[i]}</span>
              <span className="flex-1 text-left text-navy">{option}</span>
              {revealed && isCorrect && <span className="text-ocean-dark" aria-label="Rätt svar">✓</span>}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className={`mt-4 rounded-xl p-4 ${wasRight ? "bg-seafoam" : "bg-press-soft"}`} role="status">
          <p className={`font-semibold ${wasRight ? "text-ocean-dark" : "text-press-dark"}`}>
            {wasRight ? "Rätt!" : `Nästan. Rätt svar är ${SIGNS[q.correct]}.`}
          </p>
          {q.explanation && <p className="mt-1 text-navy/80">{q.explanation}</p>}
        </div>
      )}

      {revealed && (
        <button type="button" onClick={onNext} className="btn-primary mt-5 w-full">
          {isLast ? "Se resultatet" : "Nästa fråga"}
        </button>
      )}
    </div>
  );
}
