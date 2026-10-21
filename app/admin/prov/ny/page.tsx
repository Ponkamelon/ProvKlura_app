import Link from "next/link";
import { createStudySetAction } from "@/app/actions/studySets";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

// AI-frågegenereringen (via createStudySetAction) tar ofta 15–40 sekunder.
// Vercels standardtimeout (10s) är för kort — 60 är max på Hobby-planen.
export const maxDuration = 60;

const SUGGESTED_SUBJECTS = [
  "Matematik",
  "Svenska",
  "Engelska",
  "Biologi",
  "Fysik",
  "Kemi",
  "Historia",
  "Geografi",
  "Samhällskunskap",
  "Religion",
  "Teknik",
];

export default async function NyttProvPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: subjects } = await supabase
    .from("subjects")
    .select("name")
    .eq("admin_id", profile.id)
    .order("name");

  const subjectOptions = Array.from(
    new Set([...(subjects?.map((s) => s.name) ?? []), ...SUGGESTED_SUBJECTS]),
  );

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/prov" className="link-back">
        <Icon name="tillbaka" size={16} />
        Avbryt
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-navy">
        Nytt pluggprojekt
      </h1>
      <p className="mt-1 text-sm text-navy/60">
        Klistra in material så genererar AI:n frågorna åt dig.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral-dark">
          {searchParams.error}
        </p>
      )}

      <form action={createStudySetAction} className="notebook-card mt-6 space-y-4 p-6">
        <div>
          <label htmlFor="subject" className="field-label">
            Ämne
          </label>
          <input
            id="subject"
            name="subject"
            list="subject-options"
            required
            className="field-input"
            placeholder="t.ex. Biologi"
          />
          <datalist id="subject-options">
            {subjectOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="chapterTitle" className="field-label">
            Kapitel / provområde
          </label>
          <input
            id="chapterTitle"
            name="chapterTitle"
            required
            className="field-input"
            placeholder="t.ex. Fotosyntes och cellandning"
          />
        </div>

        <div>
          <label htmlFor="title" className="field-label">
            Titel (valfritt — annars används kapitlet)
          </label>
          <input id="title" name="title" className="field-input" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="gradeLevel" className="field-label">
              Årskurs
            </label>
            <select
              id="gradeLevel"
              name="gradeLevel"
              required
              defaultValue=""
              className="field-input"
            >
              <option value="" disabled>
                Välj
              </option>
              <option value="7">Åk 7</option>
              <option value="8">Åk 8</option>
              <option value="9">Åk 9</option>
            </select>
          </div>
          <div>
            <label htmlFor="examDate" className="field-label">
              Provdag (valfritt)
            </label>
            <input id="examDate" name="examDate" type="date" className="field-input" />
          </div>
        </div>

        <div>
          <label htmlFor="materialText" className="field-label">
            Material (klistra in text)
          </label>
          <textarea
            id="materialText"
            name="materialText"
            required
            rows={8}
            className="field-input"
            placeholder="Klistra in anteckningar, instuderingsfrågor eller text från läroboken..."
          />
        </div>

        <SubmitButton pendingText="Genererar frågor... (kan ta upp till en halv minut)" className="btn-primary w-full">
          Skapa &amp; generera frågor
        </SubmitButton>
        <p className="text-center text-xs text-navy/50">
          Tar upp till en halv minut — AI:n analyserar materialet och skapar
          frågorna.
        </p>
      </form>
    </div>
  );
}
