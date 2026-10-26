import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Medal, medalForPercent } from "@/components/Medal";
import { currentWeekStart, stockholmTodayIso } from "@/lib/nutid/week";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { getUpdatedStudySetIds } from "@/lib/quiz/variants";
import { Icon } from "@/components/Icon";
import { StudyOverview } from "@/components/StudyOverview";
import { parseOverview } from "@/lib/overview/data";
import { logEvent } from "@/lib/events/log";
import { hasFeature } from "@/lib/features";
import { getResumableAttempt } from "@/lib/quiz/resume";
import { ResumeCard } from "@/components/ResumeCard";
import { TestCard } from "@/components/TestCard";
import { getStudentQuizSets } from "@/lib/quiz/studentSets";
import { getPointStatuses, countStatuses, type PointStatusRow } from "@/lib/knowledge/status";
import { duePoints, MIXED_ROUND_SIZE, RESTART_AFTER_DAYS } from "@/lib/quiz/mixedRound";
import { compareByExam, daysUntil, examLabel } from "@/lib/quiz/examDate";

/** Högst så här många testkort visas direkt (kravspec avsnitt 2). */
const CARDS_SHOWN = 3;

export default async function ElevDashboard({ searchParams }: { searchParams: { alla?: string } }) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("assignments")
    .select("study_set_id, exam_date")
    .eq("student_id", profile.id);
  // Provdatumet ligger på tilldelningen (steg 0); setets datum är bara förval.
  const examDateBySet = new Map((assignments ?? []).map((a) => [a.study_set_id, a.exam_date as string | null]));

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

  const updatedSetIds = await getUpdatedStudySetIds(
    supabase,
    profile.id,
    (allStudySets ?? []).filter((s) => s.set_type !== "skriv").map((s) => s.id),
  );
  const nationellaUpdated = (allStudySets ?? []).some(
    (s) => s.is_official && s.set_type !== "skriv" && updatedSetIds.has(s.id),
  );

  // Har eleven redan gjort klart något kryss den här veckan?
  const { count: nutidDoneCount } = await supabase
    .from("nutidskryss_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", profile.id)
    .eq("week_start", currentWeekStart())
    .not("completed_at", "is", null);
  const nutidDone = (nutidDoneCount ?? 0) > 0;

  // Dagar med minst ett klart test, antal klara test och pluggtid. Går det inte att hämta visas nollor
  // hellre än att sidan kraschar.
  const { data: overviewRaw, error: overviewError } = await supabase.rpc("my_study_overview");
  if (overviewError) console.error("Kunde inte hämta elevöversikt:", overviewError);
  const overview = parseOverview(overviewRaw);
  const { data: goalRows } = await supabase
    .from("weekly_goals")
    .select("target_days, valid_from")
    .eq("student_id", profile.id)
    .order("valid_from");

  // "Fortsätt där du var" — förhandsfunktion tills nuläget är uppmätt.
  const stepOne = await hasFeature(supabase, profile.id, "steg1");
  const resumable = stepOne || (await hasFeature(supabase, profile.id, "fortsatt"))
    ? await getResumableAttempt(supabase, profile.id)
    : null;

  // Mätning (steg 0): besök på startsidan, så att startgraden kan räknas.
  await logEvent(supabase, "home_viewed");

  // Steg 1 (förhandsfunktion): startsidan utgår från elevens tilldelade test.
  if (stepOne) {
    const today = stockholmTodayIso();
    const sets = (await getStudentQuizSets(supabase, profile.id)).sort((a, b) => compareByExam(a, b, today));
    const points = await getPointStatuses(supabase, sets.map((s) => s.id));
    const pointsBySet = new Map<string, PointStatusRow[]>();
    for (const p of points) pointsBySet.set(p.study_set_id, [...(pointsBySet.get(p.study_set_id) ?? []), p]);
    // Steg 2: repetitionsschemat avgör vad som är aktuellt, och test med prov
    // inom sju dagar prioriteras. Kön visas aldrig som skuld — högst fem.
    const stepTwo = await hasFeature(supabase, profile.id, "steg2");
    const examSoon = new Map<string, string[] | null>(
      sets
        .filter((s) => s.examDate && daysUntil(s.examDate, today) >= 0 && daysUntil(s.examDate, today) <= 7)
        .map((s): [string, string[] | null] => [s.id, s.examAreas]),
    );
    const dueCount = Math.min(
      duePoints(points, Date.now(), stepTwo ? { schedule: true, examSoon } : {}).length,
      MIXED_ROUND_SIZE,
    );
    // Återstart (kravspec avsnitt 8): har eleven tränat förut men inte varit
    // aktiv på tio dagar erbjuds en lätt runda i stället för en kö.
    const lastActive = overview.days[0];
    const restart =
      stepTwo &&
      !!lastActive &&
      daysUntil(today, lastActive) >= RESTART_AFTER_DAYS &&
      points.some((p) => p.status !== "inte_tranat");
    const showAll = searchParams.alla === "1";
    const shown = showAll ? sets : sets.slice(0, CARDS_SHOWN);
    const updatedIds = await getUpdatedStudySetIds(supabase, profile.id, sets.map((s) => s.id));

    return (
      <div>
        <h1 className="font-display text-2xl font-semibold text-navy">Hej {firstName}! 👋</h1>

        {resumable && <ResumeCard attempt={resumable} />}

        <StudyOverview
          data={overview}
          goals={(goalRows ?? []) as { target_days: number; valid_from: string }[]}
          today={today}
        />

        <section className="mt-8" aria-labelledby="mina-prov">
          <h2 id="mina-prov" className="text-xs font-semibold uppercase tracking-wide text-navy/60">
            Mina prov
          </h2>
          {sets.length ? (
            <div className="mt-3 space-y-3">
              {shown.map((s) => (
                <TestCard
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  subject={s.subject}
                  examText={examLabel(s.examDate, today)}
                  examSoon={!!s.examDate && daysUntil(s.examDate, today) >= 0 && daysUntil(s.examDate, today) <= 7}
                  counts={countStatuses(pointsBySet.get(s.id) ?? [])}
                  updated={updatedIds.has(s.id)}
                  examToday={stepTwo && !!s.examDate && daysUntil(s.examDate, today) === 0}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-navy/70">
              Inga test tilldelade än. När din förälder eller lärare delar ett test dyker det upp här.
            </p>
          )}
          {sets.length > CARDS_SHOWN && (
            <Link
              href={showAll ? "/elev" : "/elev?alla=1"}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ocean hover:underline"
            >
              {showAll ? "Visa färre" : `Visa alla (${sets.length - CARDS_SHOWN} till)`}
              <Icon name="nasta" size={16} />
            </Link>
          )}
        </section>

        {restart ? (
          <Link
            href="/elev/repetera?aterstart=1"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-sand-deep bg-white/50 px-4 py-3 text-sm text-navy transition-colors hover:bg-white/80"
          >
            <span>
              <span className="font-medium">Välkommen tillbaka!</span> Kom igång med en lätt runda · 5 frågor
            </span>
            <Icon name="nasta" size={16} className="text-navy/40" />
          </Link>
        ) : dueCount > 0 && (
          <Link
            href="/elev/repetera"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-sand-deep bg-white/50 px-4 py-3 text-sm text-navy transition-colors hover:bg-white/80"
          >
            <span>
              Repetera blandat · {dueCount} {dueCount === 1 ? "sak" : "saker"}
            </span>
            <Icon name="nasta" size={16} className="text-navy/40" />
          </Link>
        )}

        <div className="mt-8 space-y-3">
          <Link
            href="/elev/nutid"
            className="nutid-card flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
          >
            <div>
              <p className="font-medium text-navy">Veckans nutidskryss 📰</p>
              <p className="text-sm text-navy/60">
                {nutidDone ? "Klart för veckan! Titta på din nutidskoll" : "Tio frågor om veckans nyheter — 1, X eller 2"}
              </p>
            </div>
            <Icon name="nasta" className="text-navy/40" />
          </Link>
          {hasSkrivklura && (
            <Link
              href="/elev/skrivklura"
              className="skriv-card flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
            >
              <div>
                <p className="font-medium text-navy">Skrivklura</p>
                <p className="text-sm text-navy/60">Träna på att skriva, en liten bit i taget</p>
              </div>
              <Icon name="nasta" className="text-navy/40" />
            </Link>
          )}
          <Link
            href="/elev/ideverkstad"
            className="skriv-card flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
          >
            <div>
              <p className="font-medium text-navy">Idéverkstad ✨</p>
              <p className="text-sm text-navy/60">Svara på några frågor och få idéer till din text</p>
            </div>
            <Icon name="nasta" className="text-navy/40" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-navy">
        Hej {firstName}! 👋
      </h1>

      {resumable && <ResumeCard attempt={resumable} />}

      <StudyOverview
        data={overview}
        goals={(goalRows ?? []) as { target_days: number; valid_from: string }[]}
        today={stockholmTodayIso()}
      />

      {hasNationella && (
        <Link
          href="/elev/nationella"
          className="notebook-card mt-6 flex items-center justify-between gap-3 border-l-4 border-coral p-4 transition-transform hover:-translate-y-0.5"
        >
          <div>
            <p className="flex items-center gap-2 font-medium text-navy">
              Nationella prov
              {nationellaUpdated && <UpdatedBadge />}
            </p>
            <p className="text-sm text-navy/60">
              Dina tilldelade övningsprov inför nationella proven
            </p>
          </div>
          <Icon name="nasta" className="text-navy/40" />
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
          <Icon name="nasta" className="text-navy/40" />
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
              : "Tio frågor om veckans nyheter — 1, X eller 2"}
          </p>
        </div>
        <Icon name="nasta" className="text-navy/40" />
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
        <Icon name="nasta" className="text-navy/40" />
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
                  <p className="flex flex-wrap items-center gap-2 font-medium text-navy">
                    {s.title}
                    {updatedSetIds.has(s.id) && <UpdatedBadge />}
                  </p>
                  {(examDateBySet.get(s.id) ?? s.exam_date) && (
                    <p className="mt-1 text-sm text-coral">Prov {examDateBySet.get(s.id) ?? s.exam_date}</p>
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
