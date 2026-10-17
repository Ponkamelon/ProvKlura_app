import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Medal, medalForPercent } from "@/components/Medal";
import { currentWeekStart } from "@/lib/nutid/week";

export default async function ElevDashboard() {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("study_set_id")
    .eq("student_id", profile.id);

  const studySetIds = assignments?.map((a) => a.study_set_id) ?? [];

  const { data: allStudySets } = studySetIds.length
    ? await supabase
        .from("study_sets")
        .select("id, title, status, exam_date, chapter_id, is_official, set_type")
        .in("id", studySetIds)
        .eq("status", "published")
    : {
        data: [] as {
          id: string;
          title: string;
          status: string;
          exam_date: string | null;
          chapter_id: string;
          is_official: boolean;
          set_type: string;
        }[],
      };

  // Nationella prov (is_official) har flyttat till sin egen sida,
  // /elev/nationella — visas bara som en genväg härifrån.
  // Skrivövningar som föräldern gjort själv (inte officiella) visas också
  // bara under Skrivklura, aldrig som quiz.
  const studySets = (allStudySets ?? []).filter(
    (s) => !s.is_official && s.set_type !== "skriv",
  );
  // Skrivklura (set_type = 'skriv') är också officiellt innehåll men har
  // sin egen sida, /elev/skrivklura, och räknas inte som nationella prov.
  const hasNationella = (allStudySets ?? []).some(
    (s) => s.is_official && s.set_type !== "skriv",
  );
  const hasSkrivklura = (allStudySets ?? []).some((s) => s.set_type === "skriv");

  const chapterIds = [...new Set(studySets.map((s) => s.chapter_id))];

  const { data: chapters } = chapterIds.length
    ? await supabase.from("chapters").select("id, subject_id").in("id", chapterIds)
    : { data: [] as { id: string; subject_id: string }[] };

  const subjectIds = [...new Set((chapters ?? []).map((c) => c.subject_id))];

  const { data: subjects } = subjectIds.length
    ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
    : { data: [] as { id: string; name: string }[] };

  const chapterToSubject = new Map((chapters ?? []).map((c) => [c.id, c.subject_id]));
  const subjectNameById = new Map((subjects ?? []).map((s) => [s.id, s.name]));

  // Bästa resultat per pluggprojekt, för att visa medaljen eleven faktiskt
  // uppnått — inte det senaste försöket om ett tidigare var bättre.
  const activeIds = studySets.map((s) => s.id);
  const { data: attempts } = activeIds.length
    ? await supabase
        .from("attempts")
        .select("study_set_id, score, total_questions, completed_at")
        .eq("student_id", profile.id)
        .not("completed_at", "is", null)
        .in("study_set_id", activeIds)
    : { data: [] as { study_set_id: string; score: number | null; total_questions: number | null; completed_at: string | null }[] };

  const bestPercentByStudySet = new Map<string, number>();
  for (const a of attempts ?? []) {
    if (!a.total_questions || a.score === null) continue;
    const percent = Math.round((a.score / a.total_questions) * 100);
    const current = bestPercentByStudySet.get(a.study_set_id) ?? -1;
    if (percent > current) bestPercentByStudySet.set(a.study_set_id, percent);
  }

  const firstName = profile.display_name.split(" ")[0];

  // Har eleven redan gjort klart något kryss den här veckan?
  const { count: nutidDoneCount } = await supabase
    .from("nutidskryss_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", profile.id)
    .eq("week_start", currentWeekStart())
    .not("completed_at", "is", null);
  const nutidDone = (nutidDoneCount ?? 0) > 0;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-navy">
        Hej {firstName}! 👋
      </h1>

      {hasNationella && (
        <Link
          href="/elev/nationella"
          className="notebook-card mt-6 flex items-center justify-between gap-3 border-l-4 border-coral p-4 transition-transform hover:-translate-y-0.5"
        >
          <div>
            <p className="font-medium text-navy">Nationella prov</p>
            <p className="text-sm text-navy/60">
              Dina tilldelade övningsprov inför nationella proven
            </p>
          </div>
          <span className="text-navy/40">→</span>
        </Link>
      )}

      {hasSkrivklura && (
        <Link
          href="/elev/skrivklura"
          className="skriv-card mt-4 flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
        >
          <div>
            <p className="font-medium text-navy">Skrivklura</p>
            <p className="text-sm text-navy/60">
              Träna på att skriva, en liten bit i taget
            </p>
          </div>
          <span className="text-navy/40">→</span>
        </Link>
      )}

      <Link
        href="/elev/nutid"
        className="nutid-card mt-4 flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
      >
        <div>
          <p className="font-medium text-navy">Veckans nutidskryss 📰</p>
          <p className="text-sm text-navy/60">
            {nutidDone
              ? "Klart för veckan! Titta på din nutidskoll"
              : "Ett litet kryss om vad som händer just nu"}
          </p>
        </div>
        <span className="text-navy/40">→</span>
      </Link>

      <Link
        href="/elev/ideverkstad"
        className="skriv-card mt-4 flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
      >
        <div>
          <p className="font-medium text-navy">Idéverkstad ✨</p>
          <p className="text-sm text-navy/60">
            Svara på några frågor och få idéer till din text
          </p>
        </div>
        <span className="text-navy/40">→</span>
      </Link>

      {!studySets.length ? (
        <p className="mt-6 text-navy/70">
          {hasNationella || hasSkrivklura
            ? "Inga andra pluggprojekt tilldelade än."
            : "Inga pluggprojekt tilldelade än. När din admin lägger till ett prov dyker det upp här."}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {studySets.map((s) => {
            const subjectId = chapterToSubject.get(s.chapter_id);
            const subjectName = subjectId ? subjectNameById.get(subjectId) : undefined;
            const bestPercent = bestPercentByStudySet.get(s.id);
            const tier = bestPercent !== undefined ? medalForPercent(bestPercent) : null;

            return (
              <Link
                key={s.id}
                href={`/elev/plugga/${s.id}`}
                className="notebook-card flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
              >
                <div>
                  {subjectName && <p className="text-xs text-navy/50">{subjectName}</p>}
                  <p className="font-medium text-navy">{s.title}</p>
                  {s.exam_date && (
                    <p className="mt-1 text-sm text-coral">Prov {s.exam_date}</p>
                  )}
                </div>
                {tier && (
                  <div className="shrink-0 text-center">
                    <Medal tier={tier} size={40} />
                    <p className="mt-0.5 font-mono text-xs text-navy/50">{bestPercent}%</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
