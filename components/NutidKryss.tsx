"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { saveNutidProgressAction } from "@/app/actions/nutid";
import { NutidGrid, type GridCell } from "@/components/NutidGrid";
import { normalizeAnswer, type CrosswordLayout } from "@/lib/nutid/layout";
import type { StudentEntry } from "@/lib/nutid/types";
import { Icon } from "@/components/Icon";

type Message = { tone: "ok" | "hint"; text: string } | null;

function shuffled<T>(list: T[], seed: number): T[] {
  // Fast "blandning" per kryss så ordbanken inte hoppar runt mellan besök.
  return [...list]
    .map((item, i) => ({ item, k: Math.sin(seed + i * 12.9898) * 43758.5453 % 1 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

export function NutidKryss({
  kryssId,
  title,
  entries,
  layout,
  initialSolved,
  isNews,
}: {
  kryssId: string;
  title: string;
  entries: StudentEntry[];
  layout: CrosswordLayout;
  initialSolved: string[];
  isNews: boolean;
}) {
  const placements = layout.placements;
  const [solved, setSolved] = useState<Set<number>>(
    () => new Set(placements.filter((p) => initialSolved.includes(p.answer)).map((p) => p.index)),
  );
  const firstOpen = placements.find((p) => !solved.has(p.index)) ?? placements[0];
  const [active, setActive] = useState<number>(firstOpen.index);
  const [revealed, setRevealed] = useState<Record<number, number>>({});
  const [hintsUsed, setHintsUsed] = useState(0);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [showBank, setShowBank] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activePlacement = placements.find((p) => p.index === active)!;
  const activeEntry = entries[active];
  const allSolved = solved.size === placements.length;
  const bank = useMemo(
    () => shuffled(placements.map((p) => p.answer), kryssId.charCodeAt(0) + placements.length),
    [placements, kryssId],
  );

  useEffect(() => {
    setInput("");
  }, [active]);

  function persist(nextSolved: Set<number>, hints: number) {
    void saveNutidProgressAction({
      kryssId,
      solved: placements.filter((p) => nextSolved.has(p.index)).map((p) => p.answer),
      hintsUsed: hints,
    }).catch(() => {
      // Sparas nästa gång istället — eleven ska inte märka något.
    });
  }

  function select(index: number) {
    setActive(index);
    setMessage(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onCellClick(cell: GridCell) {
    // Klick på en korsning växlar mellan orden; annars väljs ordet som går genom rutan.
    const options = cell.entries;
    const next = options.includes(active) && options.length > 1
      ? options.find((e) => e !== active)!
      : options.find((e) => !solved.has(e)) ?? options[0];
    select(next);
  }

  function check() {
    const guess = normalizeAnswer(input);
    if (!guess) return;
    const answer = activePlacement.answer;
    if (guess === answer) {
      const next = new Set(solved).add(active);
      setSolved(next);
      persist(next, hintsUsed);
      const subject = activeEntry.subject ? ` Det hör till ${activeEntry.subject.toLowerCase()}.` : "";
      setMessage({ tone: "ok", text: `Rätt! ${answer} ✓${subject}` });
      const upcoming =
        placements.find((p) => p.index !== active && !next.has(p.index) && p.number > activePlacement.number) ??
        placements.find((p) => !next.has(p.index));
      if (upcoming) setActive(upcoming.index);
      return;
    }
    setMessage({
      tone: "hint",
      text:
        guess.length !== answer.length
          ? `Nästan! Ordet har ${answer.length} bokstäver. Du skrev ${guess.length}.`
          : "Inte riktigt. Prova igen, eller tryck Jag fastnar.",
    });
  }

  function stuck() {
    const shown = revealed[active] ?? 0;
    if (shown >= activePlacement.answer.length - 1) {
      setMessage({ tone: "hint", text: "Nu saknas bara sista bokstaven. Du klarar det!" });
      return;
    }
    setRevealed({ ...revealed, [active]: shown + 1 });
    setHintsUsed((h) => h + 1);
    setMessage(null);
  }

  function letterAt(cell: GridCell) {
    if (cell.entries.some((e) => solved.has(e))) return cell.letter;
    for (const e of cell.entries) {
      const p = placements.find((x) => x.index === e)!;
      const pos = p.dir === "across" ? cell.col - p.col : cell.row - p.row;
      if (pos < (revealed[e] ?? 0)) return cell.letter;
    }
    return "";
  }

  const pattern = [...activePlacement.answer]
    .map((ch, i) => (i < (revealed[active] ?? 0) ? ch : "_"))
    .join(" ");

  return (
    <div data-nutid>
      <div className="flex items-center justify-between gap-3">
        <Link href="/elev/nutid" className="link-back">
          <Icon name="tillbaka" size={16} />
          Nutidskrysset
        </Link>
        <span className="nutid-badge" aria-live="polite">
          {solved.size} av {placements.length} ord
        </span>
      </div>

      <h1 className="mt-3 font-display text-2xl font-semibold leading-tight text-navy">{title}</h1>

      <div className="nutid-card mt-4 p-3 sm:p-4">
        <NutidGrid
          layout={layout}
          letterAt={letterAt}
          activeEntry={allSolved ? null : active}
          solvedEntries={solved}
          onCellClick={allSolved ? undefined : onCellClick}
          label={`Korsord med ${placements.length} ord, ${solved.size} lösta`}
        />
      </div>

      {allSolved ? (
        <div className="nutid-card mt-4 p-5">
          <p className="font-accent text-2xl font-bold text-press">Klart!</p>
          <h2 className="mt-1 text-2xl font-semibold text-navy">Du löste alla {placements.length} ord</h2>
          <p className="mt-3 text-navy/80">Ord du har koll på nu:</p>
          <ul className="mt-2 space-y-2">
            {placements.map((p) => (
              <li key={p.index} className="flex items-center justify-between gap-3 rounded-xl bg-press-soft/60 px-3 py-2">
                <span className="font-semibold text-navy">{p.answer}</span>
                <span className="text-sm text-navy/70">{entries[p.index].subject}</span>
              </li>
            ))}
          </ul>
          {isNews && (
            <p className="mt-4 text-sm text-navy/70">
              Alla ord byggde på nyheter som fanns hos minst två olika nyhetsredaktioner.
            </p>
          )}
          <Link href="/elev/nutid" className="btn-primary mt-6 w-full">
            Se din nutidskoll
          </Link>
        </div>
      ) : (
        <div className="nutid-card mt-4 p-5">
          <p className="font-accent text-xl font-bold leading-none text-press">
            {activePlacement.number} {activePlacement.dir === "across" ? "vågrätt →" : "lodrätt ↓"}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-navy">{activeEntry.clue}</h2>
          {activeEntry.sourceNames.length > 0 && (
            <p className="mt-2 text-sm text-navy/60">Nyheten fanns hos: {activeEntry.sourceNames.join(", ")}</p>
          )}

          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <label htmlFor="nutid-svar" className="field-label">
              {activePlacement.answer.length} bokstäver
              {(revealed[active] ?? 0) > 0 && (
                <span className="ml-2 font-mono tracking-widest text-press">{pattern}</span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                id="nutid-svar"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                className="field-input flex-1 font-mono text-lg uppercase tracking-widest"
                placeholder="Skriv ordet"
              />
              <button type="submit" className="btn-primary px-5">
                Kolla
              </button>
            </div>
          </form>

          {message && (
            <p
              role="status"
              className={`mt-3 rounded-xl px-4 py-3 ${message.tone === "ok" ? "bg-seafoam text-ocean-dark" : "bg-press-soft text-navy"}`}
            >
              {message.text}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={stuck} className="nutid-chip inline-flex items-center gap-1.5 border-dashed">
              <Icon name="jag-fastnar" size={16} />
              Jag fastnar
            </button>
            <button
              type="button"
              aria-expanded={showBank}
              onClick={() => setShowBank((v) => !v)}
              className="nutid-chip"
            >
              {showBank ? "Göm ordbanken" : "Visa ordbanken"}
            </button>
          </div>

          {showBank && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Ordbank">
              {bank.map((word) => {
                const used = placements.some((p) => p.answer === word && solved.has(p.index));
                return (
                  <button
                    key={word}
                    type="button"
                    disabled={used}
                    onClick={() => {
                      setInput(word);
                      inputRef.current?.focus();
                    }}
                    className={`rounded-lg px-2 py-1 font-mono text-sm ${used ? "bg-white/60 text-navy/30 line-through" : "bg-press-soft text-press-dark"}`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-navy">Alla ledtrådar</h2>
        <ul className="mt-2 space-y-2">
          {placements.map((p) => {
            const isSolved = solved.has(p.index);
            const isActive = p.index === active && !allSolved;
            return (
              <li key={`${p.number}-${p.dir}`}>
                <button
                  type="button"
                  onClick={() => select(p.index)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-white ring-2 ring-press" : "bg-white/70 hover:bg-white"
                  }`}
                >
                  <span className="mt-0.5 w-10 shrink-0 font-mono text-sm text-press">
                    {p.number}
                    {p.dir === "across" ? "→" : "↓"}
                  </span>
                  <span className={`flex-1 text-sm ${isSolved ? "text-navy/50" : "text-navy"}`}>
                    {entries[p.index].clue}
                  </span>
                  {isSolved && <span className="text-ocean-dark" aria-label="Löst">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
