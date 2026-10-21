import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import {
  cancelInvitationAction,
  deleteStudentAction,
} from "@/app/actions/students";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function EleverPage({
  searchParams,
}: {
  searchParams: { invited?: string; linked?: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: guardianRows } = await supabase
    .from("student_guardians")
    .select("student_id")
    .eq("admin_id", profile.id);

  const studentIds = guardianRows?.map((g) => g.student_id) ?? [];

  const [{ data: students }, { data: invitations }, { data: allGuardianRows }] =
    await Promise.all([
      studentIds.length
        ? supabase.from("profiles").select("*").in("id", studentIds).order("display_name")
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      supabase
        .from("invitations")
        .select("*")
        .eq("admin_id", profile.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      studentIds.length
        ? supabase.from("student_guardians").select("student_id").in("student_id", studentIds)
        : Promise.resolve({ data: [] as { student_id: string }[] }),
    ]);

  // Hur många föräldrar varje elev är kopplad till totalt — för att
  // visa "delad med ... till" och avgöra om borttagning bara kopplar
  // bort mig eller raderar eleven helt (se deleteStudentAction).
  const guardianCountByStudent = new Map<string, number>();
  for (const row of allGuardianRows ?? []) {
    guardianCountByStudent.set(
      row.student_id,
      (guardianCountByStudent.get(row.student_id) ?? 0) + 1,
    );
  }

  const justInvited = invitations?.find(
    (i) => i.invite_token === searchParams.invited,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy">
            Elever
          </h1>
          <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
        </div>
        <Link href="/admin/elever/ny" className="btn-primary">
          <Icon name="lagg-till-elev" />
          Lägg till elev
        </Link>
      </div>

      {searchParams.linked && (
        <div className="mt-6 rounded-xl border border-turquoise bg-seafoam p-4">
          <p className="text-sm font-medium text-navy">
            Kopplad till befintlig elev: {searchParams.linked}! Den e-postadressen
            hade redan ett aktiverat konto (troligen skapat av en annan
            förälder), så du är nu tillagd som ytterligare förälder till
            samma elev — inget nytt konto behövde skapas.
          </p>
        </div>
      )}

      {justInvited && (
        <div className="mt-6 rounded-xl border border-turquoise bg-seafoam p-4">
          <p className="text-sm font-medium text-navy">
            Inbjudan skapad för {justInvited.student_name}. Skicka länken:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-white px-3 py-2 text-xs text-navy/80">
              {SITE_URL}/valkommen/{justInvited.invite_token}
            </code>
            <CopyLinkButton
              link={`${SITE_URL}/valkommen/${justInvited.invite_token}`}
            />
          </div>
          <p className="mt-2 text-xs text-navy/50">
            Automatiska inbjudningsmejl är inte kopplat in än — dela länken
            manuellt tills vidare. Om mejladressen redan tillhör en aktiverad
            elev kopplas du automatiskt som ytterligare förälder istället.
          </p>
        </div>
      )}

      <section className="mt-8">
        {!students?.length && !invitations?.length ? (
          <div className="notebook-card p-8 text-center">
            <p className="text-navy/70">Inga elever än. Lägg till din första!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {students?.map((student) => {
              const guardianCount = guardianCountByStudent.get(student.id as string) ?? 1;
              return (
                <div
                  key={student.id as string}
                  className="notebook-card flex items-center justify-between p-4"
                >
                  <Link
                    href={`/admin/elever/${student.id}`}
                    className="flex-1 transition-opacity hover:opacity-70"
                  >
                    <p className="font-medium text-navy">
                      {student.display_name as string}
                    </p>
                    <p className="text-sm text-navy/60">
                      {student.email as string} · Åk {student.grade_level as number}
                    </p>
                    {guardianCount > 1 && (
                      <p className="mt-1 text-xs text-ocean-dark">
                        Delad med {guardianCount - 1} annan förälder
                        {guardianCount - 1 > 1 ? "er" : ""}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="whitespace-nowrap rounded-full bg-seafoam px-3 py-1 text-xs font-medium text-ocean-dark">
                      Aktiv
                    </span>
                    <form action={deleteStudentAction.bind(null, student.id as string)}>
                      <ConfirmSubmitButton
                        message={
                          guardianCount > 1
                            ? `Sluta hantera ${student.display_name as string}? Kontot och den andra förälderns koppling finns kvar.`
                            : `Ta bort ${student.display_name as string}? Elevens konto och alla resultat raderas permanent. Det går inte att ångra.`
                        }
                        className="icon-btn icon-btn-danger"
                        ariaLabel={guardianCount > 1 ? `Sluta hantera ${student.display_name as string}` : `Ta bort ${student.display_name as string}`}
                        title={
                          guardianCount > 1
                            ? "Slutar hantera eleven — kontot och den andra förälderns koppling finns kvar"
                            : "Raderar elevens konto och alla resultat permanent"
                        }
                      >
                        <Icon name={guardianCount > 1 ? "logga-ut" : "ta-bort"} />
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}

            {invitations?.map((invitation) => (
              <div
                key={invitation.id}
                className="notebook-card flex items-center justify-between p-4 opacity-80"
              >
                <div>
                  <p className="font-medium text-navy">
                    {invitation.student_name}
                  </p>
                  <p className="text-sm text-navy/60">
                    {invitation.email} · Åk {invitation.grade_level}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-sun/20 px-3 py-1 text-xs font-medium text-navy/70">
                    Väntar på aktivering
                  </span>
                  <form action={cancelInvitationAction.bind(null, invitation.id)}>
                    <button
                      type="submit"
                      className="link-back text-xs text-navy/60 hover:text-coral-dark"
                    >
                      <Icon name="avbryt" size={14} />
                      Avbryt
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
