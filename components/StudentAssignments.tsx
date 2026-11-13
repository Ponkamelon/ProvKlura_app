import { updateStudentAssignmentsAction } from "@/app/actions/assignments";
import { Icon } from "@/components/Icon";

export type AssignmentRow = {
  setId: string;
  title: string;
  subject: string;
  isOfficial: boolean;
  assigned: boolean;
  /** Tilldelad av någon annan, t.ex. en lärare: kan inte tas bort härifrån. */
  locked: boolean;
  examDate: string | null;
  lastTrained: string | null;
};

const fmt = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

function Row({ row }: { row: AssignmentRow }) {
  const meta = [
    row.isOfficial ? "Nationellt" : row.subject,
    row.examDate ? `Prov ${fmt(row.examDate)}` : null,
    row.lastTrained ? `Senast tränat ${fmt(row.lastTrained)}` : row.assigned ? "Inte påbörjat" : null,
  ].filter(Boolean);
  return (
    <label
      className={
        "flex items-start gap-3 rounded-xl px-3 py-2 transition-colors " +
        (row.locked ? "opacity-70" : "cursor-pointer hover:bg-sand/60")
      }
    >
      <input type="hidden" name="shown" value={row.setId} />
      <input
        type="checkbox"
        name="setIds"
        value={row.setId}
        defaultChecked={row.assigned}
        disabled={row.locked}
        className="mt-1 h-4 w-4 shrink-0 rounded border-sand-deep"
      />
      {/* Ett inaktiverat fält skickas inte – behåll tilldelningen. */}
      {row.locked && <input type="hidden" name="setIds" value={row.setId} />}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-navy">{row.title}</span>
        <span className="block text-xs text-navy/55">
          {meta.join(" · ")}
          {row.locked && " · Tilldelat av någon annan"}
        </span>
      </span>
    </label>
  );
}

/** Föräldern ser och väljer vilka test som ligger öppna för eleven. */
export function StudentAssignments({
  studentId,
  firstName,
  rows,
}: {
  studentId: string;
  firstName: string;
  rows: AssignmentRow[];
}) {
  const assigned = rows.filter((r) => r.assigned);
  const available = rows.filter((r) => !r.assigned);

  // Gruppera de tilldelade per ämne, så listan blir lätt att överblicka.
  const bySubject = new Map<string, AssignmentRow[]>();
  for (const r of assigned) {
    const key = r.isOfficial ? "Nationella test" : r.subject;
    bySubject.set(key, [...(bySubject.get(key) ?? []), r]);
  }

  return (
    <section className="notebook-card mt-10 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-navy">Tilldelade test</h2>
        <p className="text-sm text-navy/60">
          {assigned.length} {assigned.length === 1 ? "test" : "test"} syns för {firstName}
        </p>
      </div>
      <p className="mt-1 text-sm text-navy/60">
        Bocka ur test som inte är aktuella, så blir startsidan lugnare för {firstName}. Svaren och framstegen
        sparas, och du kan bocka i testet igen när som helst.
      </p>

      <form action={updateStudentAssignmentsAction.bind(null, studentId)} className="mt-4">
        {assigned.length ? (
          <div className="space-y-4">
            {[...bySubject.entries()].map(([subject, list]) => (
              <div key={subject}>
                <h3 className="px-3 text-xs font-semibold uppercase tracking-wide text-navy/45">{subject}</h3>
                <div className="mt-1">
                  {list.map((r) => (
                    <Row key={r.setId} row={r} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-navy/60">Inga test är tilldelade just nu.</p>
        )}

        {available.length > 0 && (
          <details className="mt-4 border-t border-sand-deep pt-3">
            <summary className="cursor-pointer px-3 text-sm font-medium text-ocean-dark">
              Lägg till fler av dina test ({available.length})
            </summary>
            <div className="mt-2">
              {available.map((r) => (
                <Row key={r.setId} row={r} />
              ))}
            </div>
          </details>
        )}

        <button type="submit" className="btn-primary mt-4">
          <Icon name="spara" />
          Spara ändringar
        </button>
      </form>
    </section>
  );
}
