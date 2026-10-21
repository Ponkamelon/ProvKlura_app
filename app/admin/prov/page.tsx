import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";

type StudySetListItem = {
  id: string;
  title: string;
  grade_level: number | null;
  status: string;
  chapters: { title: string; subjects: { name: string } | null } | null;
  questions: { count: number }[] | null;
};

export default async function ProvListPage({
  searchParams,
}: {
  searchParams: { created_parts?: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data } = await supabase
    .from("study_sets")
    .select("id, title, grade_level, status, chapters(title, subjects(name)), questions(count)")
    .eq("admin_id", profile.id)
    .order("created_at", { ascending: false });

  const studySets = (data ?? []) as unknown as StudySetListItem[];
  const createdParts = Number(searchParams.created_parts ?? 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-navy">
            Pluggprojekt
          </h1>
          <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
        </div>
        <Link href="/admin/prov/ny" className="btn-primary">
          <Icon name="lagg-till" />
          Nytt pluggprojekt
        </Link>
      </div>

      {createdParts > 1 && (
        <div className="mt-4 rounded-xl border border-turquoise bg-seafoam p-4">
          <p className="text-sm font-medium text-navy">
            Materialet var stort, så det blev {createdParts} delprov (Del 1,
            Del 2, ...) istället för ett.
          </p>
          <p className="mt-1 text-xs text-navy/60">
            Del 1 har redan genererade frågor. Öppna varje övrig del och
            tryck "Generera frågor" när du är redo för den.
          </p>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {!studySets.length && (
          <div className="notebook-card p-8 text-center">
            <p className="text-navy/70">
              Inga pluggprojekt än. Skapa det första!
            </p>
          </div>
        )}
        {studySets.map((s) => (
          <Link
            key={s.id}
            href={`/admin/prov/${s.id}`}
            className="notebook-card block p-4 transition-transform hover:-translate-y-0.5"
          >
            <p className="text-xs text-navy/50">
              {s.chapters?.subjects?.name} · {s.chapters?.title}
            </p>
            <p className="font-medium text-navy">{s.title}</p>
            <p className="mt-1 text-sm text-navy/60">
              Åk {s.grade_level} · {s.questions?.[0]?.count ?? 0} frågor ·{" "}
              {s.status === "published" ? "Publicerat" : "Utkast"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
