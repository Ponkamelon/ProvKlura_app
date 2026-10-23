import Link from "next/link";
import { endPausedAttemptAction } from "@/app/actions/quiz";
import { Icon } from "@/components/Icon";
import type { ResumableAttempt } from "@/lib/quiz/resume";

/**
 * "Fortsätt där du var" överst på startsidan (kravspec avsnitt 2). Visas
 * bara när ett pass är pausat eller lämnat mitt i, med frågor kvar.
 */
export function ResumeCard({ attempt }: { attempt: ResumableAttempt }) {
  return (
    <section
      aria-label="Fortsätt där du var"
      className="notebook-card mt-6 border-l-4 border-ocean p-4"
    >
      <Link
        href={`/elev/plugga/${attempt.studySetId}/quiz?fortsatt=${attempt.id}`}
        className="flex items-center justify-between gap-3"
      >
        <div>
          <p className="font-medium text-navy">Fortsätt där du var</p>
          <p className="text-sm text-navy/60">
            {attempt.title} · fråga {attempt.answered + 1} av {attempt.total}
          </p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean text-white">
          <Icon name="nasta" size={20} />
          <span className="sr-only">Fortsätt</span>
        </span>
      </Link>
      <form action={endPausedAttemptAction.bind(null, attempt.id)} className="mt-2">
        <button type="submit" className="text-xs text-navy/50 underline hover:text-navy">
          Avsluta passet – {attempt.answered === 1 ? "svaret" : "svaren"} du redan gett finns kvar
        </button>
      </form>
    </section>
  );
}
