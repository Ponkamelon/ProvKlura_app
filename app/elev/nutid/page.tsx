import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { NutidProgressView } from "@/components/NutidProgressView";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentKryss } from "@/lib/nutid/current";
import { computeProgress, type AttemptRow } from "@/lib/nutid/progress";
import { currentWeekStart, isoWeekNumber } from "@/lib/nutid/week";

type AttemptWithKryss = AttemptRow & { kryss_id: string };

export default async function NutidPage() {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const [current, { data: rawAttempts }, { data: earlier }] = await Promise.all([
    getCurrentKryss(supabase),
    supabase
      .from("nutidskryss_attempts")
      .select("kryss_id, week_start, solved, solved_count, total, completed_at")
      .eq("student_id", profile.id),
    supabase
      .from("nutidskryss")
      .select("id, title, week_start, entries")
      .eq("status", "published")
      .eq("is_evergreen", false)
      .lt("week_start", currentWeekStart())
      .order("week_start", { ascending: false })
      .limit(3),
  ]);

  const attempts = (rawAttempts ?? []) as AttemptWithKryss[];
  const progress = computeProgress(attempts);
  const attemptFor = (id: string) => attempts.find((a) => a.kryss_id === id);
  const currentAttempt = current ? attemptFor(current.id) : undefined;
  const wordCount = current?.layout?.placements.length ?? 0;

  let cta = "Starta veckans kryss";
  let status = `${wordCount} ord · ca 5 minuter`;
  if (currentAttempt?.completed_at) {
    cta = "Titta på krysset igen";
    status = "Klart! Snyggt jobbat.";
  } else if (currentAttempt && currentAttempt.solved_count > 0) {
    cta = "Fortsätt";
    status = `${currentAttempt.solved_count} av ${currentAttempt.total} ord lösta`;
  }

  return (
    <div data-nutid>
      <Link href="/elev" className="text-sm text-navy/60 underline">
        ← Mina pluggprojekt
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Nutidskrysset</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#B4235A" />
      <p className="mt-3 text-navy/70">
        Ett litet kryss varje vecka om sådant som händer i världen just nu.
      </p>

      {current ? (
        <div className="nutid-card mt-6 p-5">
          <p className="nutid-badge">
            {current.is_evergreen ? "Veckans kryss" : `Vecka ${isoWeekNumber(current.week_start ?? currentWeekStart())}`}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-navy">
            {current.is_evergreen ? current.title : "Veckans nyheter"}
          </h2>
          <p className="mt-1 text-navy/70">{status}</p>
          <Link href={`/elev/nutid/${current.id}`} className="btn-primary mt-5 w-full">
            {cta}
          </Link>
        </div>
      ) : (
        <div className="nutid-card mt-6 p-8 text-center">
          <p className="text-navy/70">Veckans kryss är inte klart än. Titta in lite senare!</p>
        </div>
      )}

      <div className="nutid-card mt-4 p-5">
        <NutidProgressView progress={progress} />
      </div>

      {!!earlier?.length && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold text-navy">Tidigare veckor</h2>
          <p className="mt-1 text-sm text-navy/60">Missade du ett? Du kan göra det nu också.</p>
          <div className="mt-3 space-y-2">
            {earlier.map((k) => {
              const a = attemptFor(k.id);
              const total = Array.isArray(k.entries) ? k.entries.length : 0;
              return (
                <Link
                  key={k.id}
                  href={`/elev/nutid/${k.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/80 p-3 transition-colors hover:bg-white"
                >
                  <span className="font-medium text-navy">Vecka {isoWeekNumber(k.week_start)}</span>
                  <span className="text-sm text-navy/60">
                    {a?.completed_at ? "Klart ✓" : a?.solved_count ? `${a.solved_count} av ${total}` : `${total} ord`}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
