import Link from "next/link";
import { UpdatedBadge } from "@/components/UpdatedBadge";
import { STATUS_LABEL, STATUS_ORDER, type StatusCounts } from "@/lib/knowledge/status";

const BAR_COLOR: Record<(typeof STATUS_ORDER)[number], string> = {
  kan: "bg-ocean",
  osaker: "bg-sun",
  behover_trana: "bg-coral",
  inte_tranat: "bg-sand-deep/60",
};

/**
 * Testkort på elevens startsida (kravspec avsnitt 2): ämne och namn,
 * provdatum med dagar kvar, framsteg som både text och stapel, och två
 * val — Kort runda och Hela testet. Färg kompletteras alltid med text.
 */
export function TestCard({
  id,
  title,
  subject,
  examText,
  examSoon,
  counts,
  updated,
  examToday = false,
}: {
  id: string;
  title: string;
  subject: string | null;
  examText: string;
  examSoon: boolean;
  counts: StatusCounts;
  updated: boolean;
  /** Provdagen (steg 2): den korta rundan är bara repetition. */
  examToday?: boolean;
}) {
  const legend = STATUS_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${STATUS_LABEL[s]} ${counts[s]}`)
    .join(" · ");

  return (
    <article className="notebook-card p-4" aria-labelledby={`kort-${id}`}>
      {subject && <p className="text-xs text-navy/50">{subject}</p>}
      <h3 id={`kort-${id}`} className="flex flex-wrap items-center gap-2 font-medium text-navy">
        {title}
        {updated && <UpdatedBadge />}
      </h3>
      <p className={`mt-0.5 text-sm ${examSoon ? "font-medium text-coral-dark" : "text-navy/60"}`}>{examText}</p>

      {counts.total > 0 && (
        <div className="mt-3">
          <p className="text-sm text-navy">
            {counts.kan} av {counts.total} punkter Kan
          </p>
          <div
            className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-white/70"
            role="img"
            aria-label={legend}
            title={legend}
          >
            {STATUS_ORDER.map((s) =>
              counts[s] ? (
                <div key={s} className={BAR_COLOR[s]} style={{ width: `${(counts[s] / counts.total) * 100}%` }} />
              ) : null,
            )}
          </div>
          <p className="mt-1 text-xs text-navy/50">{legend}</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={`/elev/plugga/${id}/quiz?runda=kort&kalla=testkort`}
          className="btn-primary justify-center px-3 py-2 text-sm"
        >
          {examToday ? "Kort repetition · 3 min" : "Kort runda · 3 min"}
        </Link>
        <Link
          href={`/elev/plugga/${id}/quiz?length=alla&kalla=testkort`}
          className="btn-secondary justify-center px-3 py-2 text-sm"
        >
          Hela testet
        </Link>
      </div>
    </article>
  );
}
