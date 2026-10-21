import type { OverviewData } from "@/lib/overview/streak";
import { computeStreak, formatStudyTime, weekStrip } from "@/lib/overview/streak";

/**
 * Elevens översikt på startsidan: svit (dagar i rad), antal klara test och
 * tid. En dag räknas i sviten när eleven gjort klart minst ett test — antal
 * rätt spelar ingen roll. Allt formulerat uppmuntrande — en bruten svit visas aldrig som ett
 * misslyckande, bara som en chans att starta en ny.
 */
export function StudyOverview({ data, today }: { data: OverviewData; today: string }) {
  const streak = computeStreak(data.days, today);
  const time = formatStudyTime(data.seconds);
  const week = weekStrip(data.days, today);

  let message: string;
  if (streak.activeToday && streak.current >= 2) {
    message = `${streak.current} dagar i rad – snyggt jobbat!`;
  } else if (streak.activeToday) {
    message = "Bra jobbat idag! Gör klart ett test imorgon också, så har du en svit.";
  } else if (streak.current > 0) {
    message = `Gör klart ett test idag så blir det ${streak.current + 1} dagar i rad.`;
  } else if (data.tests === 0) {
    message = "Gör ditt första test – det tar bara några minuter.";
  } else {
    message = "Gör klart ett test idag så startar du en ny svit.";
  }

  return (
    <section aria-labelledby="oversikt-rubrik" className="notebook-card mt-6 p-4">
      <h2 id="oversikt-rubrik" className="sr-only">
        Din översikt
      </h2>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat
          emoji="🔥"
          value={String(streak.current)}
          label={streak.current === 1 ? "dag i rad" : "dagar i rad"}
          accent="text-coral"
        />
        <Stat
          emoji="✅"
          value={String(data.tests)}
          label={data.tests === 1 ? "test klart" : "test klara"}
          accent="text-ocean"
        />
        <Stat emoji="⏱️" value={time.value} label={`${time.unit} pluggat`} accent="text-ink" />
      </dl>

      <ol className="mt-4 flex justify-between gap-1 border-t border-sand-deep pt-3" aria-label="Den här veckan">
        {week.map((d) => (
          <li key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs ${
                d.active
                  ? "border-coral bg-coral text-white"
                  : d.future
                    ? "border-dashed border-navy/15 bg-transparent"
                    : "border-navy/15 bg-white/70"
              } ${d.isToday ? "ring-2 ring-coral/30 ring-offset-2 ring-offset-transparent" : ""}`}
            >
              {d.active ? "✓" : ""}
            </span>
            <span className={`font-mono text-[10px] ${d.isToday ? "font-semibold text-navy" : "text-navy/60"}`}>
              {d.isToday ? "idag" : d.label}
            </span>
            <span className="sr-only">
              {d.isToday ? "Idag" : d.date}: {d.active ? "test klart" : "inget test klart"}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm text-navy">{message}</p>
      {streak.best >= 2 && streak.best > streak.current && (
        <p className="mt-1 text-xs text-navy/60">Ditt rekord: {streak.best} dagar i rad</p>
      )}
    </section>
  );
}

function Stat({
  emoji,
  value,
  label,
  accent,
}: {
  emoji: string;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <dt className="order-2 text-xs leading-tight text-navy/60">{label}</dt>
      <dd className={`order-1 font-mono text-3xl font-medium leading-none ${accent}`}>
        <span aria-hidden="true" className="mb-1 block text-lg">
          {emoji}
        </span>
        {value}
      </dd>
    </div>
  );
}
