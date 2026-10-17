import type { NutidProgress } from "@/lib/nutid/progress";

const DOT: Record<string, { className: string; label: string }> = {
  klar: { className: "bg-press border-press", label: "klart" },
  delvis: { className: "bg-press/40 border-press", label: "påbörjat" },
  tom: { className: "bg-white/70 border-navy/15", label: "inget" },
};

/**
 * Trend och framsteg: åtta veckor bakåt som prickar, nivå och totalt antal
 * ord. Tomma veckor är neutrala — aldrig röda eller "missade".
 */
export function NutidProgressView({
  progress,
  compact = false,
}: {
  progress: NutidProgress;
  compact?: boolean;
}) {
  const { weeks, totalWords, level, trend } = progress;

  return (
    <div>
      {!compact && (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-navy/60">Din nutidskoll</p>
            <p className="font-display text-2xl font-semibold text-navy">{level.name}</p>
          </div>
          <p className="text-right">
            <span className="font-mono text-3xl font-medium text-press">{totalWords}</span>
            <span className="block text-xs text-navy/60">ord totalt</span>
          </p>
        </div>
      )}

      {!compact && level.nextName && (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-white/70"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level.share * 100)}
            aria-label={`Mot nivån ${level.nextName}`}
          >
            <div className="h-full rounded-full bg-press" style={{ width: `${Math.max(4, level.share * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-navy/60">
            {level.wordsToNext} ord kvar till {level.nextName}
          </p>
        </div>
      )}

      <ol className={`${compact ? "" : "mt-5"} flex items-end justify-between gap-1`} aria-label="De senaste åtta veckorna">
        {weeks.map((w, i) => {
          const dot = DOT[w.status];
          const isCurrent = i === weeks.length - 1;
          return (
            <li key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`block h-6 w-6 rounded-full border-2 ${dot.className} ${isCurrent ? "ring-2 ring-press/30 ring-offset-2 ring-offset-transparent" : ""}`}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] text-navy/60">
                {isCurrent ? "nu" : `v${w.week}`}
              </span>
              <span className="sr-only">
                Vecka {w.week}: {dot.label}
                {w.solved ? `, ${w.solved} ord` : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {!compact && <p className="mt-4 text-navy">{trend}</p>}
    </div>
  );
}
