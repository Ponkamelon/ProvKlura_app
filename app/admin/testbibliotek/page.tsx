import Link from "next/link";
import Image from "next/image";
import { WaveDivider } from "@/components/WaveDivider";
import { OfficialBadge } from "@/components/OfficialBadge";
import { SkrivBadge } from "@/components/SkrivBadge";
import { isWritingSubject } from "@/lib/writing/subjects";
import { getSubjectVisual } from "@/lib/subjectVisuals";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RenewalDot } from "@/components/RenewalDot";
import { getOpenRenewals } from "@/lib/renewal/requests";

export default async function TestbibliotekPage() {
  const profile = await requireProfile("admin");
  const supabase = createClient();
  const renewalSubjects = new Set(
    (await getOpenRenewals(supabase, profile.id)).filter((r) => r.isOfficial).map((r) => r.subjectId),
  );

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("is_official", true)
    .order("name");

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy">
        Testbibliotek
      </h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
      <p className="mt-4 max-w-lg text-navy/70">
        Färdiga, kvalitetssäkrade tester per ämne — bra inför nationella prov
        i årskurs 9. Dela direkt med dina elever, inget material att klistra
        in. Under Skrivklura finns skrivövningar där eleven bygger en text
        steg för steg och får kort feedback.
      </p>

      <div className="mt-8 space-y-3">
        {!subjects?.length ? (
          <div className="notebook-card p-8 text-center">
            <p className="text-navy/70">
              Inga färdiga ämnen ännu — fler är på väg.
            </p>
          </div>
        ) : (
          subjects.map((s) => {
            const visual = getSubjectVisual(s.name);
            const isWriting = isWritingSubject(s.name);
            return (
              <Link
                key={s.id}
                href={`/admin/testbibliotek/${s.id}`}
                className={`${isWriting ? "skriv-card" : "notebook-card"} block p-4 transition-transform hover:-translate-y-0.5`}
                style={isWriting ? undefined : { borderLeft: `6px solid ${visual.color}` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src={visual.icon}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-lg"
                    />
                    <p className="flex items-center gap-2 font-medium text-navy">
                      {s.name}
                      {renewalSubjects.has(s.id) && <RenewalDot label="En elev vill att ett test här förnyas" />}
                    </p>
                  </div>
                  {isWriting ? <SkrivBadge /> : <OfficialBadge />}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
