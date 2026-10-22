import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";
import { ShareAppButton } from "@/components/ShareAppButton";
import { RenewalDot } from "@/components/RenewalDot";
import { getOpenRenewals } from "@/lib/renewal/requests";

export default async function AdminDashboard() {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const [{ count: studentCount }, { count: pendingCount }, { count: studySetCount }] =
    await Promise.all([
      supabase
        .from("student_guardians")
        .select("id", { count: "exact", head: true })
        .eq("admin_id", profile.id),
      supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("admin_id", profile.id)
        .eq("status", "pending"),
      supabase
        .from("study_sets")
        .select("id", { count: "exact", head: true })
        .eq("admin_id", profile.id),
    ]);

  const firstName = profile.display_name.split(" ")[0];

  const { data: isEditor } = await supabase.rpc("is_content_editor");
  const { count: nutidDrafts } =
    isEditor === true
      ? await supabase
          .from("nutidskryss")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft")
      : { count: 0 };

  const renewals = await getOpenRenewals(supabase, profile.id);
  const renewalTitles = renewals.length
    ? await supabase
        .from("study_sets")
        .select("id, title")
        .in("id", [...new Set(renewals.map((r) => r.studySetId))])
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map((renewalTitles.data ?? []).map((s) => [s.id, s.title]));

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-navy">
        Hej {firstName}!
      </h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />

      {renewals.length > 0 && (
        <section className="mt-6 rounded-xl border-2 border-alert/40 bg-white/70 p-4" aria-labelledby="fornya-rubrik">
          <h2 id="fornya-rubrik" className="flex items-center gap-2 font-semibold text-navy">
            <RenewalDot label="Önskemål om förnyade test" />
            Vill ha nya test
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {renewals.map((r) => (
              <li key={r.id}>
                <Link
                  href={
                    r.isOfficial
                      ? `/admin/testbibliotek/${r.subjectId ?? ""}#test-${r.studySetId}`
                      : `/admin/prov/${r.studySetId}`
                  }
                  className="text-ocean hover:underline"
                >
                  {r.studentName} fick alla rätt på {titleById.get(r.studySetId) ?? "ett test"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/elever"
          className="notebook-card block p-6 transition-transform hover:-translate-y-0.5"
        >
          <p className="text-sm text-navy/60">Elever</p>
          <p className="mt-1 font-display text-3xl font-semibold text-navy">
            {studentCount ?? 0}
          </p>
          {pendingCount ? (
            <p className="mt-1 text-sm text-coral">
              {pendingCount} väntar på aktivering
            </p>
          ) : null}
        </Link>

        <Link
          href="/admin/prov"
          className="notebook-card block p-6 transition-transform hover:-translate-y-0.5"
        >
          <p className="flex items-center gap-2 text-sm text-navy/60">
            Pluggprojekt
            {renewals.some((r) => !r.isOfficial) && <RenewalDot label="En elev vill att ett pluggprojekt förnyas" />}
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-navy">
            {studySetCount ?? 0}
          </p>
        </Link>

        <Link
          href="/admin/prov/ny"
          className="notebook-card flex flex-col items-center justify-center gap-2 p-6 text-center transition-transform hover:-translate-y-0.5"
        >
          <span className="btn-primary">
            <Icon name="lagg-till" />
            Nytt pluggprojekt
          </span>
        </Link>

        <Link
          href="/admin/testbibliotek"
          className="notebook-card flex flex-col items-center justify-center gap-2 border-l-4 border-coral p-6 text-center transition-transform hover:-translate-y-0.5"
        >
          <span className="btn-secondary">
            📚 Nationella prov
            {renewals.some((r) => r.isOfficial) && <RenewalDot label="En elev vill att ett nationellt prov förnyas" />}
          </span>
          <span className="text-xs text-navy/50">Färdiga, dela direkt</span>
        </Link>

        {isEditor === true && (
          <Link
            href="/admin/nutidskryss"
            className="nutid-card flex flex-col items-center justify-center gap-2 p-6 text-center transition-transform hover:-translate-y-0.5"
          >
            <span className="font-semibold text-navy">📰 Nutidskrysset</span>
            <span className="text-xs text-navy/60">
              {nutidDrafts ? `${nutidDrafts} utkast väntar på granskning` : "Inga utkast att granska"}
            </span>
          </Link>
        )}

        <div className="notebook-card flex flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="font-semibold text-navy">Känner du fler föräldrar?</p>
          <p className="text-xs text-navy/60">Tipsa dem om ProvKlura</p>
          <ShareAppButton />
        </div>
      </div>
    </div>
  );
}
