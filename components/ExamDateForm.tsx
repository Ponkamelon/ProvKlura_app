import { updateAssignmentExamAction } from "@/app/actions/assignments";
import { SubmitButton } from "@/components/SubmitButton";

/**
 * Förälderns provdatum och provområde för en elevs tilldelning (steg 0).
 * Provområdet visas bara när testet täcker flera kunskapsområden.
 */
export function ExamDateForm({
  assignment,
  studentName,
  areas,
  returnPath,
}: {
  assignment: { id: string; exam_date: string | null; exam_areas: string[] | null };
  studentName: string;
  areas: string[];
  returnPath: string;
}) {
  const chosen = assignment.exam_areas;
  const inputId = `prov-${assignment.id}`;
  return (
    <form
      action={updateAssignmentExamAction.bind(null, assignment.id, returnPath)}
      className="rounded-xl border border-sand-deep bg-white/60 p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={inputId} className="block text-xs font-medium text-navy/70">
            Provdatum för {studentName}
          </label>
          <input
            id={inputId}
            name="examDate"
            type="date"
            defaultValue={assignment.exam_date ?? ""}
            className="field-input mt-1 py-1.5 text-sm"
          />
        </div>
        <SubmitButton pendingText="Sparar…" className="btn-secondary px-4 py-2 text-sm">
          Spara
        </SubmitButton>
      </div>
      {areas.length > 1 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ocean">
            Provområde: {chosen?.length ? `${chosen.length} av ${areas.length} områden` : "hela testet"}
          </summary>
          <fieldset className="mt-2 grid gap-1 sm:grid-cols-2">
            <legend className="sr-only">Vilka områden provet omfattar</legend>
            {areas.map((area) => (
              <label key={area} className="flex items-center gap-2 text-navy">
                <input
                  type="checkbox"
                  name="examAreas"
                  value={area}
                  defaultChecked={!chosen?.length || chosen.includes(area)}
                  className="h-4 w-4 rounded border-sand-deep"
                />
                {area}
              </label>
            ))}
          </fieldset>
          <p className="mt-1 text-xs text-navy/50">Alla ikryssade betyder hela testet.</p>
        </details>
      )}
      <input type="hidden" name="areaCount" value={areas.length} />
    </form>
  );
}
