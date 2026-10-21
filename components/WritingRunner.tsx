"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { saveTrainingResultAction, submitWritingAction } from "@/app/actions/writing";
import {
  RESULT_LABEL,
  countWords,
  resultFromTraining,
  type TimeLevel,
  type WritingBlock,
  type WritingContent,
  type WritingFeedback,
  type WritingResult,
} from "@/lib/writing/types";
import { Icon } from "@/components/Icon";
import { useActiveTime } from "@/lib/useActiveTime";

type Screen =
  | { kind: "what" }
  | { kind: "needs" }
  | { kind: "example" }
  | { kind: "train"; index: number }
  | { kind: "trainDone" }
  | { kind: "reminder" }
  | { kind: "topic" }
  | { kind: "block"; index: number }
  | { kind: "assemble" }
  | { kind: "guidedFeedback" }
  | { kind: "testIntro" }
  | { kind: "testWrite" }
  | { kind: "testFeedback" };

type Phase = "lar" | "trana" | "skriv" | "testa";

const PHASE_LABEL: Record<Phase, string> = {
  lar: "Lär",
  trana: "Träna",
  skriv: "Skriv",
  testa: "Testa",
};

function phaseOf(screen: Screen): Phase {
  switch (screen.kind) {
    case "what":
    case "needs":
    case "example":
      return "lar";
    case "train":
    case "trainDone":
      return "trana";
    case "testIntro":
    case "testWrite":
    case "testFeedback":
      return "testa";
    default:
      return "skriv";
  }
}

type Draft = {
  topic: string;
  parts: Record<string, string>;
  assembled: string;
  assembledEdited: boolean;
  testText: string;
};

const EMPTY_DRAFT: Draft = {
  topic: "",
  parts: {},
  assembled: "",
  assembledEdited: false,
  testText: "",
};

/** Sätter ihop klossarna till löpande text: nytt stycke efter varannan kloss. */
function assembleParts(blocks: WritingBlock[], parts: Record<string, string>): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  blocks.forEach((block, i) => {
    const value = (parts[block.id] ?? "").trim();
    if (value) current.push(value);
    if (i % 2 === 1 && current.length) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs.join("\n\n");
}

export function WritingRunner({
  studySetId,
  title,
  content,
  level,
  skipLearn,
}: {
  studySetId: string;
  title: string;
  content: WritingContent;
  level: TimeLevel;
  /** Eleven kan redan grunderna: hoppa över Lär och Träna. */
  skipLearn: boolean;
}) {
  const hubHref = `/elev/skrivklura/${studySetId}`;
  const draftKey = `skrivklura:${studySetId}`;

  const trainingQuestions = useMemo(() => {
    const count = level === "snabb" ? 3 : level === "normal" ? 4 : 5;
    return content.training.slice(0, count);
  }, [content.training, level]);

  const screens = useMemo<Screen[]>(() => {
    const list: Screen[] = [];
    const learn = level === "snabb" || !skipLearn;
    if (learn) {
      list.push({ kind: "what" }, { kind: "needs" }, { kind: "example" });
      trainingQuestions.forEach((_, index) => list.push({ kind: "train", index }));
      list.push({ kind: "trainDone" });
    }
    if (level !== "snabb") {
      if (!learn) list.push({ kind: "reminder" });
      list.push({ kind: "topic" });
      content.blocks.forEach((_, index) => list.push({ kind: "block", index }));
      list.push({ kind: "assemble" }, { kind: "guidedFeedback" });
    }
    if (level === "fordjupning") {
      list.push({ kind: "testIntro" }, { kind: "testWrite" }, { kind: "testFeedback" });
    }
    return list;
  }, [content.blocks, level, skipLearn, trainingQuestions]);

  const phases = useMemo(() => {
    const seen: Phase[] = [];
    for (const s of screens) {
      const p = phaseOf(s);
      if (!seen.includes(p)) seen.push(p);
    }
    return seen;
  }, [screens]);

  const activeTime = useActiveTime();
  const [position, setPosition] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Träna
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [trainingResult, setTrainingResult] = useState<WritingResult | null>(null);

  // Jag fastnar
  const [hintsShown, setHintsShown] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);

  // Feedback
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guidedOutcome, setGuidedOutcome] = useState<{ result: WritingResult; feedback: WritingFeedback } | null>(null);
  const [testOutcome, setTestOutcome] = useState<{ result: WritingResult; feedback: WritingFeedback } | null>(null);

  // Sätts när sista skrivsteget är inlämnat: då ska utkastet inte sparas
  // om, annars möts eleven av sin gamla text nästa gång.
  const finishedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const screen = screens[position];
  const phase = phaseOf(screen);

  // Utkastet sparas i webbläsaren så texten finns kvar om eleven råkar
  // stänga fliken eller tar en paus mitt i.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) setDraft({ ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) });
    } catch {
      // Ingen lagring tillgänglig — övningen fungerar ändå.
    }
    setDraftLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded || finishedRef.current) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Se ovan.
    }
  }, [draft, draftKey, draftLoaded]);

  // Ny skärm: nollställ det som hör till skärmen och flytta fokus till
  // rubriken så tangentbord och skärmläsare hamnar rätt.
  useEffect(() => {
    setSelected(null);
    setHintsShown(0);
    setErrorMessage(null);
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [position]);

  function goNext() {
    setPosition((p) => Math.min(p + 1, screens.length - 1));
  }

  function goBack() {
    setPosition((p) => Math.max(p - 1, 0));
  }

  function goTo(kind: Screen["kind"]) {
    const target = screens.findIndex((s) => s.kind === kind);
    if (target !== -1) setPosition(target);
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function setPart(blockId: string, value: string) {
    setDraft((d) => ({ ...d, parts: { ...d.parts, [blockId]: value } }));
  }

  function showHint() {
    setHintsShown((n) => n + 1);
    setHintsUsed((n) => n + 1);
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Se ovan.
    }
  }

  async function finishTraining(finalCorrect: number) {
    const result = resultFromTraining(finalCorrect, trainingQuestions.length);
    setTrainingResult(result);
    goNext();
    try {
      await saveTrainingResultAction({
        studySetId,
        level,
        correct: finalCorrect,
        total: trainingQuestions.length,
        activeSeconds: activeTime.take(),
      });
    } catch {
      // Resultatet visas ändå — att det inte sparades stoppar inte eleven.
    }
  }

  async function submitText(mode: "gor_sjalv" | "testa") {
    if (submitting) return;
    const text = mode === "gor_sjalv" ? draft.assembled : draft.testText;
    setSubmitting(true);
    setErrorMessage(null);
    const activeSeconds = activeTime.take();
    try {
      const response = await submitWritingAction({
        studySetId,
        mode,
        level,
        topic: draft.topic,
        parts: mode === "gor_sjalv" ? draft.parts : null,
        text,
        hintsUsed,
        activeSeconds,
      });
      if (!response.ok) {
        activeTime.giveBack(activeSeconds);
        setErrorMessage(response.message);
        return;
      }
      const outcome = { result: response.result, feedback: response.feedback };
      if (mode === "gor_sjalv") setGuidedOutcome(outcome);
      else setTestOutcome(outcome);
      if (mode === "testa" || level !== "fordjupning") {
        finishedRef.current = true;
        clearDraft();
      }
      setHintsUsed(0);
      goNext();
    } catch {
      activeTime.giveBack(activeSeconds);
      setErrorMessage("Det gick inte att skicka just nu. Din text finns kvar. Försök igen om en stund.");
    } finally {
      setSubmitting(false);
    }
  }

  function insertIntoTextarea(snippet: string, current: string, onChange: (v: string) => void) {
    const el = textareaRef.current;
    if (!el) {
      onChange(current ? `${current} ${snippet} ` : `${snippet} `);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insert = `${needsSpace ? " " : ""}${snippet} `;
    onChange(before + insert + after);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  const progressPercent = Math.round(((position + 1) / screens.length) * 100);

  return (
    <div data-skrivklura>
      <div className="flex items-center justify-between gap-3">
        <Link href={hubHref} className="link-back">
          <Icon name="pausa" size={16} />
          Pausa
        </Link>
        <span className="skriv-badge">Skrivklura · {title}</span>
      </div>

      <ol className="mt-4 flex gap-2" aria-label="Var du är i övningen">
        {phases.map((p) => {
          const active = p === phase;
          const done = phases.indexOf(p) < phases.indexOf(phase);
          return (
            <li
              key={p}
              aria-current={active ? "step" : undefined}
              className={`flex-1 rounded-full px-2 py-1 text-center text-xs font-semibold ${
                active
                  ? "bg-ink text-white"
                  : done
                    ? "bg-ink-soft text-ink-dark"
                    : "bg-white/60 text-navy/50"
              }`}
            >
              {done ? "✓ " : ""}
              {PHASE_LABEL[p]}
            </li>
          );
        })}
      </ol>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Hur långt du har kommit"
      >
        <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="skriv-card mt-5 p-5">
        {screen.kind === "what" && (
          <>
            <StepLabel>Vad är det?</StepLabel>
            <Heading ref={headingRef}>{content.genre}</Heading>
            <div className="mt-3 space-y-2 text-lg leading-relaxed text-navy">
              {content.what.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <NextButton onClick={goNext}>Okej, nästa</NextButton>
          </>
        )}

        {screen.kind === "needs" && (
          <>
            <StepLabel>Vad behöver jag kunna?</StepLabel>
            <Heading ref={headingRef}>Det här räcker</Heading>
            <ul className="mt-4 space-y-3">
              {content.needs.map((need, i) => (
                <li key={need} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-soft font-mono text-sm font-medium text-ink-dark">
                    {i + 1}
                  </span>
                  <span className="text-lg leading-snug text-navy">{need}</span>
                </li>
              ))}
            </ul>
            <NavRow onBack={goBack}>
              <NextButton onClick={goNext}>Visa ett exempel</NextButton>
            </NavRow>
          </>
        )}

        {screen.kind === "example" && (
          <>
            <StepLabel>Exempel</StepLabel>
            <Heading ref={headingRef}>Så här kan det se ut</Heading>
            <div className="mt-4 space-y-3">
              {content.blocks.map((block) => (
                <div key={block.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink">{block.label}</p>
                  <p className="mt-0.5 leading-relaxed text-navy">{block.example}</p>
                </div>
              ))}
            </div>
            <MemoryRule blocks={content.blocks} />
            <NavRow onBack={goBack}>
              <NextButton onClick={goNext}>Dags att träna</NextButton>
            </NavRow>
          </>
        )}

        {screen.kind === "train" && (() => {
          const q = trainingQuestions[screen.index];
          const answered = selected !== null;
          const wasCorrect = selected === q.correct;
          const isLast = screen.index + 1 >= trainingQuestions.length;
          return (
            <>
              <StepLabel>
                Fråga {screen.index + 1} av {trainingQuestions.length}
              </StepLabel>
              <Heading ref={headingRef}>{q.question}</Heading>
              <div className="mt-4 space-y-2">
                {q.options.map((option) => {
                  const isCorrect = option === q.correct;
                  const isChosen = option === selected;
                  let tone = "border-sand-deep bg-white hover:border-ink";
                  if (answered && isCorrect) tone = "border-ocean bg-seafoam";
                  else if (answered && isChosen) tone = "border-sand-deep bg-sand/60";
                  else if (answered) tone = "border-sand-deep bg-white opacity-60";
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={answered}
                      onClick={() => {
                        setSelected(option);
                        if (option === q.correct) setCorrectCount((c) => c + 1);
                      }}
                      className={`block w-full rounded-xl border-2 px-4 py-3 text-left text-navy transition-colors ${tone}`}
                    >
                      {answered && isCorrect ? "✓ " : ""}
                      {option}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <div className="mt-4 rounded-xl bg-ink-soft p-4" role="status">
                  <p className="font-semibold text-ink-dark">
                    {wasCorrect ? "Rätt!" : "Nästan. Titta på det markerade svaret."}
                  </p>
                  <p className="mt-1 text-navy/80">{q.explanation}</p>
                </div>
              )}
              {answered && (
                <NextButton
                  onClick={() => {
                    if (isLast) void finishTraining(correctCount);
                    else goNext();
                  }}
                >
                  {isLast ? "Klar" : "Nästa fråga"}
                </NextButton>
              )}
            </>
          );
        })()}

        {screen.kind === "trainDone" && (
          <>
            <StepLabel>Grunderna</StepLabel>
            <Heading ref={headingRef}>
              {correctCount} av {trainingQuestions.length} rätt
            </Heading>
            {trainingResult && <ResultChip result={trainingResult} />}
            <p className="mt-3 text-lg text-navy">
              {trainingResult === "kan"
                ? `Du har koll på hur en ${content.genre.toLowerCase()} är uppbyggd.`
                : "Bra att du testade. Varje varv gör att det fastnar lite mer."}
            </p>
            <MemoryRule blocks={content.blocks} />
            {level === "snabb" ? (
              <>
                <Link href={hubHref} className="btn-primary mt-6 w-full">
                  <Icon name="klar-for-idag" />
                  Klar för idag
                </Link>
                <Link
                  href={`${hubHref}/ova?niva=normal&hoppa=1`}
                  className="btn-secondary mt-3 w-full"
                >
                  Jag orkar skriva lite också
                </Link>
              </>
            ) : (
              <NextButton onClick={goNext}>Nu skriver vi</NextButton>
            )}
          </>
        )}

        {screen.kind === "reminder" && (
          <>
            <StepLabel>Kom ihåg</StepLabel>
            <Heading ref={headingRef}>{content.blocks.length} små steg</Heading>
            <p className="mt-3 text-lg text-navy">
              Du kan redan grunderna. Du skriver en liten bit i taget.
            </p>
            <MemoryRule blocks={content.blocks} />
            <NextButton onClick={goNext}>Sätt igång</NextButton>
          </>
        )}

        {screen.kind === "topic" && (
          <>
            <StepLabel>Välj ämne</StepLabel>
            <Heading ref={headingRef}>{content.topicPrompt}</Heading>
            <p className="mt-2 text-navy/70">Tryck på ett ämne. Du kan inte välja fel.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {content.topics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={draft.topic === topic}
                  onClick={() => updateDraft({ topic })}
                  className={`skriv-chip ${draft.topic === topic ? "skriv-chip-active" : ""}`}
                >
                  {topic}
                </button>
              ))}
            </div>
            <label htmlFor="eget-amne" className="field-label mt-5">
              Eller skriv ett eget
            </label>
            <input
              id="eget-amne"
              type="text"
              maxLength={80}
              value={content.topics.includes(draft.topic) ? "" : draft.topic}
              onChange={(e) => updateDraft({ topic: e.target.value })}
              className="field-input"
              placeholder="Till exempel: min lillebror"
            />
            {draft.topic.trim() ? (
              <NextButton onClick={goNext}>Jag tar det</NextButton>
            ) : (
              <button
                type="button"
                className="btn-secondary mt-6 w-full"
                onClick={() => {
                  const pick = content.topics[Math.floor(Math.random() * content.topics.length)];
                  updateDraft({ topic: pick });
                }}
              >
                Välj åt mig
              </button>
            )}
          </>
        )}

        {screen.kind === "block" && (() => {
          const block = content.blocks[screen.index];
          const value = draft.parts[block.id] ?? "";
          const hints = block.stuckQuestions;
          const allHintsShown = hintsShown >= hints.length;
          const showExample = hintsShown > hints.length;
          return (
            <>
              <StepLabel>
                Steg {screen.index + 1} av {content.blocks.length} · {draft.topic}
              </StepLabel>
              <Heading ref={headingRef}>{block.title}</Heading>
              <p className="mt-2 text-lg text-navy">{block.prompt}</p>

              <p className="mt-4 text-sm font-medium text-navy/70">Tryck på en start:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {block.starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="skriv-chip"
                    onClick={() =>
                      insertIntoTextarea(starter.replace(/…$/, ""), value, (v) => setPart(block.id, v))
                    }
                  >
                    {starter}
                  </button>
                ))}
              </div>

              <label htmlFor={`kloss-${block.id}`} className="sr-only">
                {block.title}
              </label>
              <textarea
                id={`kloss-${block.id}`}
                ref={textareaRef}
                value={value}
                onChange={(e) => setPart(block.id, e.target.value)}
                rows={4}
                maxLength={1500}
                className="skriv-paper mt-4"
                placeholder="En eller två meningar räcker."
              />

              {hintsShown > 0 && (
                <div className="mt-3 space-y-2 rounded-xl bg-ink-soft p-4" role="status">
                  {hints.slice(0, hintsShown).map((hint) => (
                    <p key={hint} className="font-medium text-ink-dark">
                      {hint}
                    </p>
                  ))}
                  {showExample && (
                    <p className="border-t border-ink/20 pt-2 text-navy/80">
                      <span className="font-semibold">Exempel: </span>
                      {block.example}
                    </p>
                  )}
                </div>
              )}

              {!showExample && (
                <button type="button" onClick={showHint} className="skriv-stuck mt-3 gap-2">
                  <Icon name="jag-fastnar" size={18} />
                  {hintsShown === 0
                    ? "Jag fastnar"
                    : allHintsShown
                      ? "Visa ett exempel"
                      : "En fråga till"}
                </button>
              )}

              <NavRow onBack={goBack}>
                {value.trim() ? (
                  <NextButton onClick={goNext}>Nästa</NextButton>
                ) : (
                  <button type="button" onClick={goNext} className="btn-secondary mt-6 w-full">
                    <Icon name="hoppa-over" />
                    Hoppa över
                  </button>
                )}
              </NavRow>
            </>
          );
        })()}

        {screen.kind === "assemble" && (
          <AssembleScreen
            headingRef={headingRef}
            textareaRef={textareaRef}
            content={content}
            draft={draft}
            updateDraft={updateDraft}
            insert={insertIntoTextarea}
            submitting={submitting}
            errorMessage={errorMessage}
            onBack={goBack}
            onSubmit={() => void submitText("gor_sjalv")}
          />
        )}

        {screen.kind === "guidedFeedback" && guidedOutcome && (
          <FeedbackView
            headingRef={headingRef}
            outcome={guidedOutcome}
            blocks={content.blocks}
            onRevise={() => goTo("assemble")}
          >
            {level === "fordjupning" ? (
              <>
                <NextButton onClick={goNext}>Skriv som på provet</NextButton>
                <Link href={hubHref} onClick={clearDraft} className="btn-secondary mt-3 w-full">
                  <Icon name="klar-for-idag" />
                  Klar för idag
                </Link>
              </>
            ) : (
              <Link href={hubHref} onClick={clearDraft} className="btn-primary mt-6 w-full">
                <Icon name="klar-for-idag" />
                Klar för idag
              </Link>
            )}
          </FeedbackView>
        )}

        {screen.kind === "testIntro" && (
          <>
            <StepLabel>Testa utan hjälp</StepLabel>
            <Heading ref={headingRef}>Nu skriver du själv</Heading>
            <p className="mt-3 text-lg text-navy">
              Samma sak som nyss, utan starter. Titta på ordningen en sista gång.
            </p>
            <MemoryRule blocks={content.blocks} />
            <p className="mt-4 text-navy/70">
              Ingen tid räknas. Fastnar du finns knappen Jag fastnar kvar.
            </p>
            <NextButton onClick={goNext}>Starta</NextButton>
          </>
        )}

        {screen.kind === "testWrite" && (() => {
          const words = countWords(draft.testText);
          const hints = content.test.stuckQuestions;
          return (
            <>
              <StepLabel>Uppgift</StepLabel>
              <Heading ref={headingRef}>{content.test.task}</Heading>

              <label htmlFor="provtext" className="sr-only">
                Din text
              </label>
              <textarea
                id="provtext"
                ref={textareaRef}
                value={draft.testText}
                onChange={(e) => updateDraft({ testText: e.target.value })}
                rows={14}
                maxLength={6000}
                className="skriv-paper mt-4"
                placeholder="Skriv din text här."
              />
              <p className="mt-2 font-mono text-sm text-navy/60" aria-live="polite">
                {words} ord · sikta på ungefär {content.test.wordGoal}
              </p>

              {hintsShown > 0 && (
                <div className="mt-3 space-y-2 rounded-xl bg-ink-soft p-4" role="status">
                  {hints.slice(0, hintsShown).map((hint) => (
                    <p key={hint} className="font-medium text-ink-dark">
                      {hint}
                    </p>
                  ))}
                </div>
              )}
              {hintsShown < hints.length && (
                <button type="button" onClick={showHint} className="skriv-stuck mt-3 gap-2">
                  <Icon name="jag-fastnar" size={18} />
                  {hintsShown === 0 ? "Jag fastnar" : "En fråga till"}
                </button>
              )}

              {errorMessage && (
                <p className="mt-4 rounded-xl bg-sun/20 p-3 text-navy" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitText("testa")}
                className="btn-primary mt-6 w-full disabled:opacity-60"
              >
                {submitting ? "Läser din text…" : "Lämna in"}
              </button>
            </>
          );
        })()}

        {screen.kind === "testFeedback" && testOutcome && (
          <FeedbackView
            headingRef={headingRef}
            outcome={testOutcome}
            blocks={content.blocks}
            onRevise={() => goTo("testWrite")}
          >
            <Link href={hubHref} onClick={clearDraft} className="btn-primary mt-6 w-full">
              <Icon name="klar-for-idag" />
              Klar för idag
            </Link>
          </FeedbackView>
        )}
      </div>
    </div>
  );
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-accent text-xl font-bold leading-none text-ink">{children}</p>;
}

/** Skärmens rubrik. Får fokus vid skärmbyte (tabIndex -1), därav ref. */
const Heading = forwardRef<HTMLHeadingElement, { children: React.ReactNode }>(
  function Heading({ children }, ref) {
    return (
      <h2
        ref={ref}
        tabIndex={-1}
        className="mt-1 text-2xl font-semibold leading-tight text-navy outline-none"
      >
        {children}
      </h2>
    );
  },
);

function NextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-primary mt-6 w-full">
      {children}
      <Icon name="nasta" />
    </button>
  );
}

function NavRow({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <>
      {children}
      <button type="button" onClick={onBack} className="link-back mt-3 w-full text-center justify-center">
        <Icon name="tillbaka" size={16} />
        Tillbaka
      </button>
    </>
  );
}

/** Minnesregeln som en rad små brickor: Händelse → Tanke → ... */
function MemoryRule({ blocks }: { blocks: WritingBlock[] }) {
  return (
    <ol className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Minnesregel">
      {blocks.map((block, i) => (
        <li key={block.id} className="flex items-center gap-1">
          <span className="rounded-lg bg-ink-soft px-2 py-1 text-sm font-semibold text-ink-dark">
            {block.label}
          </span>
          {i < blocks.length - 1 && (
            <span aria-hidden="true" className="text-ink/60">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

const RESULT_TONE: Record<WritingResult, string> = {
  kan: "bg-seafoam text-ocean-dark",
  nastan: "bg-sun/25 text-navy",
  trana: "bg-ink-soft text-ink-dark",
};

function ResultChip({ result }: { result: WritingResult }) {
  return (
    <p className={`mt-3 inline-block rounded-full px-4 py-1.5 text-base font-semibold ${RESULT_TONE[result]}`}>
      {RESULT_LABEL[result]}
    </p>
  );
}

function AssembleScreen({
  headingRef,
  textareaRef,
  content,
  draft,
  updateDraft,
  insert,
  submitting,
  errorMessage,
  onBack,
  onSubmit,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  content: WritingContent;
  draft: Draft;
  updateDraft: (patch: Partial<Draft>) => void;
  insert: (snippet: string, current: string, onChange: (v: string) => void) => void;
  submitting: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  // Sätt ihop klossarna när eleven kommer hit — men skriv aldrig över
  // en text som eleven redan har ändrat i för hand.
  useEffect(() => {
    if (!draft.assembledEdited) {
      updateDraft({ assembled: assembleParts(content.blocks, draft.parts) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = countWords(draft.assembled);

  return (
    <>
      <StepLabel>Sätt ihop</StepLabel>
      <Heading ref={headingRef}>Titta, du har skrivit en {content.genre.toLowerCase()}!</Heading>
      <p className="mt-2 text-lg text-navy">Läs den. Ändra om du vill.</p>

      <label htmlFor="hela-texten" className="sr-only">
        Hela din text
      </label>
      <textarea
        id="hela-texten"
        ref={textareaRef}
        value={draft.assembled}
        onChange={(e) => updateDraft({ assembled: e.target.value, assembledEdited: true })}
        rows={12}
        maxLength={6000}
        className="skriv-paper mt-4"
      />
      <p className="mt-2 font-mono text-sm text-navy/60" aria-live="polite">
        {words} ord
      </p>

      <p className="mt-4 text-sm font-medium text-navy/70">Ord som håller ihop texten:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {content.linkingWords.map((word) => (
          <button
            key={word}
            type="button"
            className="skriv-chip"
            onClick={() =>
              insert(word, draft.assembled, (v) => updateDraft({ assembled: v, assembledEdited: true }))
            }
          >
            {word}
          </button>
        ))}
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-xl bg-sun/20 p-3 text-navy" role="alert">
          {errorMessage}
        </p>
      )}
      <NavRow onBack={onBack}>
        <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="btn-primary mt-6 w-full disabled:opacity-60"
        >
          {submitting ? "Läser din text…" : "Få feedback"}
        </button>
      </NavRow>
    </>
  );
}

const PART_STATUS: Record<string, { mark: string; text: string; tone: string }> = {
  finns: { mark: "✓", text: "Finns med", tone: "bg-seafoam text-ocean-dark" },
  delvis: { mark: "~", text: "På gång", tone: "bg-sun/25 text-navy" },
  saknas: { mark: "+", text: "Nästa gång", tone: "bg-ink-soft text-ink-dark" },
};

function FeedbackView({
  headingRef,
  outcome,
  blocks,
  onRevise,
  children,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  outcome: { result: WritingResult; feedback: WritingFeedback };
  blocks: WritingBlock[];
  onRevise: () => void;
  children: React.ReactNode;
}) {
  const { result, feedback } = outcome;
  const needsSelfCheck = feedback.fallback && feedback.parts.length === 0;

  return (
    <>
      <StepLabel>Feedback</StepLabel>
      <Heading ref={headingRef}>Det här gjorde du bra</Heading>
      <p className="mt-2 text-lg leading-relaxed text-navy">{feedback.strength}</p>

      {!needsSelfCheck && <ResultChip result={result} />}

      {feedback.parts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {feedback.parts.map((part) => {
            const status = PART_STATUS[part.status] ?? PART_STATUS.delvis;
            return (
              <li key={part.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                <span className="font-medium text-navy">{part.label}</span>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>
                  <span aria-hidden="true">{status.mark} </span>
                  {status.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {needsSelfCheck && (
        <div className="mt-4">
          <p className="text-navy">
            Din text är sparad. Feedbacken kunde inte hämtas just nu, så bocka av själv:
          </p>
          <ul className="mt-3 space-y-2">
            {blocks.map((block) => (
              <li key={block.id}>
                <label className="flex items-center gap-3 rounded-xl bg-white p-3">
                  <input type="checkbox" className="h-5 w-5 accent-ink" />
                  <span className="font-medium text-navy">{block.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback.nextStep && (
        <div className="mt-4 rounded-xl bg-ink-soft p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink">Ett tips till nästa gång</p>
          <p className="mt-1 text-lg leading-snug text-navy">{feedback.nextStep}</p>
        </div>
      )}

      {feedback.careNote && (
        <p className="mt-4 rounded-xl bg-white p-4 text-navy">
          Det du skriver om låter tungt. Prata gärna med en vuxen du litar på, till exempel hemma
          eller på skolan.
        </p>
      )}

      {children}

      {result !== "kan" && (
        <button type="button" onClick={onRevise} className="mt-3 w-full text-center text-sm text-navy/60 underline">
          Jag vill lägga till något i texten
        </button>
      )}
    </>
  );
}
