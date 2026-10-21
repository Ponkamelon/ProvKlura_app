import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RESULT_LABEL, type WritingResult } from "@/lib/writing/types";
import { Icon } from "@/components/Icon";

const RESULT_RANK: Record<WritingResult, number> = { trana: 1, nastan: 2, kan: 3 };

/**
 * Översikt över elevens tilldelade skrivövningar (set_type = 'skriv'),
 * både officiella (Skrivklura svenska) och sådana som föräldern gjort själv.
 */
export default async function SkrivkluraPage() {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("study_set_id")
    .eq("student_id", profile.id);

  const assignedIds = assignments?.map((a) => a.study_set_id) ?? [];

  const { data: rawSets } = assignedIds.length
    ? await supabase
        .from("study_sets")
        .select("id, title, sort_order")
        .in("id", assignedIds)
        .eq("set_type", "skriv")
        .eq("status", "published")
        .order("sort_order")
    : { data: [] as { id: string; title: string; sort_order: number }[] };

  const sets = rawSets ?? [];
  const setIds = sets.map((s) => s.id);

  const { data: submissions } = setIds.length
    ? await supabase
        .from("writing_submissions")
        .select("study_set_id, result")
        .eq("student_id", profile.id)
        .in("study_set_id", setIds)
    : { data: [] as { study_set_id: string; result: WritingResult }[] };

  const bestBySet = new Map<string, WritingResult>();
  for (const s of (submissions ?? []) as { study_set_id: string; result: WritingResult }[]) {
    const current = bestBySet.get(s.study_set_id);
    if (!current || RESULT_RANK[s.result] > RESULT_RANK[current]) {
      bestBySet.set(s.study_set_id, s.result);
    }
  }

  return (
    <div data-skrivklura>
      <Link href="/elev" className="link-back">
        <Icon name="tillbaka" size={16} />
        Mina pluggprojekt
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Skrivklura</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#5B4B9E" />
      <p className="mt-3 text-navy/70">Träna på att skriva, en liten bit i taget.</p>

      {!sets.length ? (
        <div className="skriv-card mt-8 p-8 text-center">
          <p className="text-navy/70">
            Inga skrivövningar tilldelade än. Fråga din förälder eller lärare!
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {sets.map((s) => {
            const best = bestBySet.get(s.id);
            return (
              <Link
                key={s.id}
                href={`/elev/skrivklura/${s.id}`}
                className="skriv-card flex items-center justify-between gap-3 p-4 pl-6 transition-transform hover:-translate-y-0.5"
              >
                <p className="font-medium text-navy">{s.title}</p>
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                    best ? "bg-ink-soft text-ink-dark" : "bg-sand/60 text-navy/60"
                  }`}
                >
                  {best ? RESULT_LABEL[best] : "Inte påbörjad"}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href="/elev/ideverkstad"
        className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-white/80 p-4 transition-colors hover:bg-white"
      >
        <div>
          <p className="font-medium text-navy">Fastnar du på idéer? ✨</p>
          <p className="text-sm text-navy/60">Prova Idéverkstaden</p>
        </div>
        <Icon name="nasta" className="text-navy/40" />
      </Link>
    </div>
  );
}
