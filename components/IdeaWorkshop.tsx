"use client";

import { useRef, useState, useTransition } from "react";
import { generateIdeaAction } from "@/app/actions/ideas";
import { IDEA_GENRES, IDEA_LENGTHS, type IdeaLengthId } from "@/lib/ideas/genres";
import { Icon } from "@/components/Icon";

type Suggestion = { title: string; text: string; ideas: string[] };

export function IdeaWorkshop() {
  const [genreId, setGenreId] = useState(IDEA_GENRES[0].id);
  const [lengthId, setLengthId] = useState<IdeaLengthId>("kort");
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const genre = IDEA_GENRES.find((g) => g.id === genreId) ?? IDEA_GENRES[0];
  const genreAnswers = answers[genre.id] ?? {};

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [genre.id]: { ...(prev[genre.id] ?? {}), [questionId]: value },
    }));
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateIdeaAction({ genreId: genre.id, lengthId, answers: genreAnswers });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // Knappen är låst medan ett förslag hämtas, så antalet kan inte ändras under tiden.
      setCurrent(suggestions.length);
      setSuggestions((prev) => [...prev, { title: res.title, text: res.text, ideas: res.ideas }]);
      setLeft(res.left);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
  }

  const shown = suggestions[current];

  return (
    <div ref={topRef}>
      <h2 className="font-display text-xl font-semibold text-navy">Vad ska du skriva?</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {IDEA_GENRES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGenreId(g.id)}
            className={`skriv-chip ${g.id === genre.id ? "skriv-chip-active" : ""}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-navy/70">{genre.description}</p>

      <div className="mt-6 space-y-5">
        {genre.questions.map((q) => {
          const value = genreAnswers[q.id] ?? "";
          return (
            <div key={q.id} className="skriv-card p-4 pl-6">
              <label htmlFor={`q-${q.id}`} className="field-label">
                {q.label}
                {!q.required && <span className="ml-1 font-normal text-navy/50">(valfritt)</span>}
              </label>
              {q.freeText && (
                <input
                  id={`q-${q.id}`}
                  type="text"
                  value={value}
                  maxLength={300}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder ?? "Skriv här eller välj nedan"}
                  className="skriv-paper text-base"
                />
              )}
              {q.chips && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAnswer(q.id, value === chip ? "" : chip)}
                      className={`skriv-chip ${value === chip ? "skriv-chip-active" : ""}`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="skriv-card p-4 pl-6">
          <p className="field-label">Hur lång?</p>
          <div className="flex flex-wrap gap-2">
            {IDEA_LENGTHS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLengthId(l.id)}
                className={`skriv-chip ${l.id === lengthId ? "skriv-chip-active" : ""}`}
              >
                {l.label} <span className="font-normal opacity-80">· {l.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-coral/10 p-3 text-sm text-coral-dark">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={isPending}
        className="mt-6 w-full rounded-full bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-ink-dark disabled:opacity-60"
      >
        {isPending ? "Klurar ut ett förslag…" : suggestions.length ? "Ge mig ett nytt förslag" : "Ge mig ett förslag"}
      </button>
      {left !== null && (
        <p className="mt-2 text-center text-xs text-navy/50">Du kan få {left} förslag till i dag.</p>
      )}

      {shown && (
        <div ref={resultRef} className="mt-8 scroll-mt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-navy">Förslag {current + 1}</h2>
            {suggestions.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                  aria-label="Föregående förslag"
                  className="skriv-chip inline-flex items-center px-3 py-1.5 disabled:opacity-40"
                >
                  <Icon name="tillbaka" size={16} />
                </button>
                <span className="font-mono text-navy/60">
                  {current + 1}/{suggestions.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrent((c) => Math.min(suggestions.length - 1, c + 1))}
                  disabled={current === suggestions.length - 1}
                  aria-label="Nästa förslag"
                  className="skriv-chip inline-flex items-center px-3 py-1.5 disabled:opacity-40"
                >
                  <Icon name="nasta" size={16} />
                </button>
              </div>
            )}
          </div>

          <article className="skriv-card mt-3 p-5 pl-7">
            {shown.title && <h3 className="font-display text-lg font-semibold text-navy">{shown.title}</h3>}
            <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-navy">{shown.text}</p>
            <p className="mt-3 font-mono text-xs text-navy/50">{shown.text.length} tecken</p>
          </article>

          {shown.ideas.length > 0 && (
            <div className="mt-4 rounded-xl bg-white/80 p-4">
              <p className="font-semibold text-navy">Det här kan du låna</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy/80">
                {shown.ideas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-sm text-navy/70">
            Det här är ett exempel att hämta idéer från. Din egen text ska du skriva själv – byt
            namn, plats och vändning och gör den till din.
          </p>

          <button
            type="button"
            onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="skriv-stuck mt-4"
          >
            Ändra svaren och testa igen
          </button>
        </div>
      )}
    </div>
  );
}
