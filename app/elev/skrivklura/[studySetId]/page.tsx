import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  RESULT_LABEL,
  TIME_LEVELS,
  parseWritingContent,
  type WritingResult,
} from "@/lib/writing/types";

type SubmissionRow = {
  mode: "trana" | "gor_sjalv" | "testa";
  result: WritingResult;
};

const RESULT_RANK: Record<WritingResult, number> = { trana: 1, nastan: 2, kan: 3 };

const STEPS: { mode: SubmissionRow["mode"]; label: string }[] = [
  { mode: "trana", label: "Lär och träna" },
  { mode: "gor_sjalv", label: "Gör själv" },
  { mode: "testa", label: "Testa utan hjälp" },
];

export default async function SkrivkluraSetPage({
  params,
}: {
  params: { studySetId: string };
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const [{ data: studySet }, { data: rawSubmissions }] = await Promise.all([
    supabase
      .from("study_sets")
      .select("id, title, writing_content")
      .eq("id", params.studySetId)
      .eq("set_type", "skriv")
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("writing_submissions")
      .select("mode, result")
      .eq("student_id", profile.id)
      .eq("study_set_id", params.studySetId),
  ]);

  const content = studySet ? parseWritingContent(studySet.writing_content) : null;

  if (!studySet || !content) {
    return (
      <div data-skrivklura>
        <Link href="/elev/skrivklura" className="text-sm text-navy/60 underline">
          ← Skrivklura
        </Link>
        <div className="skriv-card mt-6 p-8 text-center">
          <p className="text-navy/70">Hittade inte skrivövningen.</p>
        </div>
      </div>
    );
  }

  const bestByMode = new Map<SubmissionRow["mode"], WritingResult>();
  for (const s of (rawSubmissions ?? []) as SubmissionRow[]) {
    const current = bestByMode.get(s.mode);
    if (!current || RESULT_RANK[s.result] > RESULT_RANK[current]) {
      bestByMode.set(s.mode, s.result);
    }
  }

  // Appen minns vad eleven redan kan: sitter grunderna går Normal och
  // Fördjupning direkt till skrivandet. Snabb är alltid en repetition.
  const knowsBasics = bestByMode.get("trana") === "kan";
  const hasStarted = bestByMode.size > 0;

  return (
    <div data-skrivklura>
      <Link href="/elev/skrivklura" className="text-sm text-navy/60 underline">
        ← Skrivklura
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">{studySet.title}</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#5B4B9E" />

      <ol className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Minnesregel">
        {content.blocks.map((block, i) => (
          <li key={block.id} className="flex items-center gap-1">
            <span className="rounded-lg bg-white/80 px-2 py-1 text-sm font-semibold text-ink-dark">
              {block.label}
            </span>
            {i < content.blocks.length - 1 && (
              <span aria-hidden="true" className="text-ink/60">
                →
              </span>
            )}
          </li>
        ))}
      </ol>

      <h2 className="mt-8 font-display text-xl font-semibold text-navy">Hur lång tid har du?</h2>
      <div className="mt-3 space-y-3">
        {TIME_LEVELS.map((level) => {
          const skip = knowsBasics && level.id !== "snabb";
          return (
            <Link
              key={level.id}
              href={`/elev/skrivklura/${studySet.id}/ova?niva=${level.id}${skip ? "&hoppa=1" : ""}`}
              className="skriv-card flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-ink text-white">
                <span className="font-mono text-lg font-medium leading-none">{level.minutes}</span>
                <span className="text-[10px] leading-tight">min</span>
              </span>
              <span>
                <span className="block font-semibold text-navy">{level.label}</span>
                <span className="block text-sm text-navy/70">
                  {skip && level.id === "normal" ? "Skriv med stöd" : level.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
      {knowsBasics && (
        <p className="mt-3 text-sm text-navy/70">
          Du kan redan grunderna, så Normal och Fördjupning går direkt till skrivandet. Vill du
          repetera? Välj Snabb.
        </p>
      )}

      {hasStarted && (
        <>
          <h2 className="mt-8 font-display text-xl font-semibold text-navy">Så här långt har du kommit</h2>
          <ul className="mt-3 space-y-2">
            {STEPS.map((step) => {
              const best = bestByMode.get(step.mode);
              return (
                <li
                  key={step.mode}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/80 p-3"
                >
                  <span className="font-medium text-navy">{step.label}</span>
                  <span
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                      best ? "bg-ink-soft text-ink-dark" : "bg-sand/60 text-navy/60"
                    }`}
                  >
                    {best ? RESULT_LABEL[best] : "Inte testat än"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
