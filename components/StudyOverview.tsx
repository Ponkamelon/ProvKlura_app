import type { OverviewData } from "@/lib/overview/data";
import { formatStudyTime, weekStrip } from "@/lib/overview/data";
import { GOAL_CHOICES, weeklyGoalStatus, type GoalRow } from "@/lib/overview/weeklyGoal";
import { setWeeklyGoalAction } from "@/app/actions/goals";

/**
 * Elevens översikt på startsidan: eget veckomål, antal klara test, tid och
 * antal veckor med nått mål. En dag räknas när eleven gjort klart minst ett
 * test — antal rätt spelar ingen roll. Missade dagar nollställer inget
 * (kravspec avsnitt 2 och 4), så här finns ingen svit som kan brytas.
 */
export function StudyOverview({
  data,
  goals,
  today,
}: {
  data: OverviewData;
  goals: GoalRow[];
  today: string;
}) {
  const goal = weeklyGoalStatus(data.days, goals, today);
  const time = formatStudyTime(data.seconds);
  const week = weekStrip(data.days, today);

  let message: string;
  if (goal.target === null) {
    message = "Välj ett veckomål: hur många dagar i veckan vill du göra klart ett test?";
  } else if (goal.reached) {
    message =
      goal.doneThisWeek > goal.target
        ? "Veckomålet är nått – och lite till! 🎉"
        : "Veckomålet är nått! 🎉 Allt extra är bonus.";
  } else {
    const left = goal.target - goal.doneThisWeek;
    message = `${left} ${left === 1 ? "dag" : "dagar"} kvar till veckomålet. Varje dag du gör klart ett test räknas.`;
  }

  return (
    <section aria-labelledby="oversikt-rubrik" className="notebook-card mt-6 p-4">
      <h2 id="oversikt-rubrik" className="sr-only">
        Din översikt
      </h2>

      <dl className="grid grid-cols-4 gap-1 text-center">
        <Stat
          emoji="🎯"
          value={goal.target === null ? "–" : `${goal.doneThisWeek}/${goal.target}`}
          label={goal.target === null ? "veckomål" : "dagar i veckan"}
          accent="text-coral"
        />
        <Stat
          emoji="✅"
          value={String(data.tests)}
          label={data.tests === 1 ? "test klart" : "test klara"}
          accent="text-ocean"
        />
        <Stat emoji="⏱️" value={time.value} label={`${time.unit} pluggat`} accent="text-ink" />
        <Stat
          emoji="🏆"
          value={String(goal.weeksReached)}
          label={goal.weeksReached === 1 ? "vecka med nått mål" : "veckor med nått mål"}
          accent="text-navy"
        />
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

      {goal.target === null ? (
        <GoalChoices current={null} />
      ) : (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ocean">Ändra veckomål</summary>
          <GoalChoices current={goal.target} />
        </details>
      )}
    </section>
  );
}

/** Knappar 1–5 dagar. Fungerar utan JavaScript (vanligt formulär). */
function GoalChoices({ current }: { current: number | null }) {
  return (
    <form action={setWeeklyGoalAction} className="mt-2">
      <fieldset>
        <legend className="sr-only">Antal dagar i veckan</legend>
        <div className="flex flex-wrap gap-2">
          {GOAL_CHOICES.map((n) => (
            <button
              key={n}
              type="submit"
              name="target"
              value={n}
              aria-pressed={current === n}
              className={`rounded-full border-2 px-3 py-1 text-sm font-medium transition-colors ${
                current === n
                  ? "border-coral bg-coral text-white"
                  : n === 3 && current === null
                    ? "border-coral bg-white text-navy hover:bg-coral/10"
                    : "border-sand-deep bg-white/70 text-navy hover:border-coral"
              }`}
            >
              {n} {n === 1 ? "dag" : "dagar"}
            </button>
          ))}
        </div>
        {current === null && (
          <p className="mt-1 text-xs text-navy/60">Tre dagar i veckan är en bra start. Du kan ändra när du vill.</p>
        )}
      </fieldset>
    </form>
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
      <dd className={`order-1 font-mono text-2xl font-medium leading-none sm:text-3xl ${accent}`}>
        <span aria-hidden="true" className="mb-1 block text-lg">
          {emoji}
        </span>
        {value}
      </dd>
    </div>
  );
}
