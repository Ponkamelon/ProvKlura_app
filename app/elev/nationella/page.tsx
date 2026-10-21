import Link from "next/link";
import Image from "next/image";
import { WaveDivider } from "@/components/WaveDivider";
import { Medal, medalForPercent } from "@/components/Medal";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSubjectVisual } from "@/lib/subjectVisuals";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { getUpdatedStudySetIds } from "@/lib/quiz/variants";

type StudySetRow = {
  id: string;
  title: string;
  set_type: "deltest" | "sluttest" | "ovrigt";
  sort_order: number;
  chapter_id: string;
};

export default async function NationellaProvPage() {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("study_set_id")
    .eq("student_id", profile.id);

  const assignedIds = assignments?.map((a) => a.study_set_id) ?? [];

  const { data: rawStudySets } = assignedIds.length
    ? await supabase
        .from("study_sets")
        .select("id, title, set_type, sort_order, chapter_id")
        .in("id", assignedIds)
        .eq("is_official", true)
        // Skrivövningar är också officiella men visas på /elev/skrivklura.
        .neq("set_type", "skriv")
        .eq("status", "published")
    : { data: [] as StudySetRow[] };

  const studySets = (rawStudySets ?? []) as StudySetRow[];
  const chapterIds = [...new Set(studySets.map((s) => s.chapter_id))];

  const { data: chapters } = chapterIds.length
    ? await supabase.from("chapters").select("id, subject_id").in("id", chapterIds)
    : { data: [] as { id: string; subject_id: string }[] };

  const chapterToSubject = new Map<string, string>(
    (chapters ?? []).map((c) => [c.id, c.subject_id]),
  );
  const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];

  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
    : { data: [] as { id: string; name: string }[] };

  const subjectNameById = new Map<string, string>(
    (subjects ?? []).map((s) => [s.id, s.name]),
  );

  const studySetIds = studySets.map((s) => s.id);
  const { data: attempts } = studySetIds.length
    ? await supabase
        .from("attempts")
        .select("study_set_id, score, total_questions, completed_at")
        .eq("student_id", profile.id)
        .not("completed_at", "is", null)
        .in("study_set_id", studySetIds)
    : { data: [] as { study_set_id: string; score: number | null; total_questions: number | null }[] };

  const updatedSetIds = await getUpdatedStudySetIds(supabase, profile.id, studySetIds);

  const bestPercentByStudySet = new Map<string, number>();
  for (const a of attempts ?? []) {
    if (!a.total_questions || a.score === null) continue;
    const percent = Math.round((a.score / a.total_questions) * 100);
    const current = bestPercentByStudySet.get(a.study_set_id) ?? -1;
    if (percent > current) bestPercentByStudySet.set(a.study_set_id, percent);
  }

  // Gruppera efter ämne, sortera testen inom varje ämne på sort_order
  const bySubject = new Map<string, StudySetRow[]>();
  for (const s of studySets) {
    const subjectId = chapterToSubject.get(s.chapter_id);
    if (!subjectId) continue;
    const list = bySubject.get(subjectId) ?? [];
    list.push(s);
    bySubject.set(subjectId, list);
  }
  for (const list of bySubject.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const subjectEntries = [...bySubject.entries()].sort((a, b) => {
    const nameA = subjectNameById.get(a[0]) ?? "";
    const nameB = subjectNameById.get(b[0]) ?? "";
    return nameA.localeCompare(nameB, "sv");
  });

  return (
    <div>
      <Link href="/elev" className="text-sm text-navy/50 underline">
        ← Mina pluggprojekt
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
        Nationella prov
      </h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
      <p className="mt-3 text-navy/70">
        Färdiga övningsprov inför de nationella proven i årskurs 9.
      </p>

      {!subjectEntries.length ? (
        <div className="notebook-card mt-8 p-8 text-center">
          <p className="text-navy/70">
            Inga nationella prov tilldelade än. Fråga din förälder eller
            lärare!
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {subjectEntries.map(([subjectId, sets]) => {
            const subjectName = subjectNameById.get(subjectId) ?? "Okänt ämne";
            const visual = getSubjectVisual(subjectName);

            return (
              <section
                key={subjectId}
                className="notebook-card overflow-hidden p-0"
                style={{ borderLeft: `6px solid ${visual.color}` }}
              >
                <div className="flex items-center gap-3 p-4 pb-2">
                  <Image
                    src={visual.icon}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-xl"
                  />
                  <h2 className="font-display text-xl font-semibold text-navy">
                    {subjectName}
                  </h2>
                </div>

                <div className="space-y-2 p-4 pt-2">
                  {sets.map((s) => {
                    const bestPercent = bestPercentByStudySet.get(s.id);
                    const tier = bestPercent !== undefined ? medalForPercent(bestPercent) : null;

                    return (
                      <Link
                        key={s.id}
                        href={`/elev/plugga/${s.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-sand/60 p-3 transition-colors hover:bg-sand"
                      >
                        <div>
                          <p className="flex flex-wrap items-center gap-2 font-medium text-navy">
                            {s.title}
                            {updatedSetIds.has(s.id) && <UpdatedBadge />}
                          </p>
                          <p className="text-xs text-navy/50">
                            {s.set_type === "sluttest" ? "Sluttest" : "Deltest"}
                          </p>
                        </div>
                        {tier && (
                          <div className="shrink-0 text-center">
                            <Medal tier={tier} size={32} />
                            <p className="mt-0.5 font-mono text-xs text-navy/50">
                              {bestPercent}%
                            </p>
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
