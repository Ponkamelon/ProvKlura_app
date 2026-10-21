import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { applyPresetAction, updatePreferencesAction } from "@/app/actions/preferences";
import { Icon } from "@/components/Icon";

const PRESETS = [
  { key: "fokus", label: "Fokus", description: "Korta pass, minimal text, snabb feedback" },
  { key: "lugn", label: "Lugn", description: "Låg visuell belastning, minimala animationer" },
  { key: "lasstod", label: "Lässtöd", description: "Större text, mer luft, uppläsning" },
  { key: "struktur", label: "Struktur", description: "Samma flöde varje gång, tydlig start/slut" },
];

export default async function AnpassningarPage({
  params,
  searchParams,
}: {
  params: { studentId: string };
  searchParams: { saved?: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.studentId)
    .eq("admin_id", profile.id)
    .eq("role", "student")
    .maybeSingle();

  if (!student) {
    return <p className="text-navy/70">Hittade inte eleven.</p>;
  }

  const { data: prefs } = await supabase
    .from("student_preferences")
    .select("*")
    .eq("student_id", student.id)
    .maybeSingle();

  const p = (prefs ?? {}) as Record<string, unknown>;

  const updateWithId = updatePreferencesAction.bind(null, student.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/admin/elever/${student.id}`}
        className="link-back"
      >
        <Icon name="tillbaka" size={16} />
        Tillbaka till {student.display_name}
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-navy">
        Anpassningar för {student.display_name}
      </h1>
      <p className="mt-1 text-sm text-navy/60">
        Produkt- och UX-stöd — inte medicinsk diagnostik.
      </p>

      {searchParams.saved && (
        <p className="mt-4 rounded-xl bg-seafoam px-3 py-2 text-sm text-ocean-dark">
          Sparat!
        </p>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-navy">Färdiga profiler</h2>
        <p className="mt-1 text-sm text-navy/60">
          Ett klick fyller i vettiga standardvärden nedan — går att finjustera efteråt.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRESETS.map((preset) => (
            <form key={preset.key} action={applyPresetAction.bind(null, student.id, preset.key)}>
              <button
                type="submit"
                className="notebook-card w-full p-4 text-left transition-transform hover:-translate-y-0.5"
              >
                <p className="font-medium text-navy">{preset.label}</p>
                <p className="mt-1 text-xs text-navy/60">{preset.description}</p>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-navy">Finjustera</h2>
        <form action={updateWithId} className="notebook-card mt-4 space-y-5 p-6">
          <div>
            <p className="field-label">Stödprofiler (flera kan kombineras)</p>
            <div className="mt-2 space-y-2">
              {[
                { name: "adhd_support", label: "Fokusstöd" },
                { name: "add_support", label: "Lugnt gränssnitt" },
                { name: "autism_support", label: "Extra förutsägbart gränssnitt" },
                { name: "dyslexia_support", label: "Lässtöd" },
                { name: "concentration_support", label: "Generella koncentrationssvårigheter" },
              ].map((f) => (
                <label key={f.name} className="flex items-center gap-2 text-sm text-navy">
                  <input
                    type="checkbox"
                    name={f.name}
                    defaultChecked={Boolean(p[f.name])}
                    className="h-4 w-4 rounded border-sand-deep"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="feedback_timing" className="field-label">
              Rätt svar
            </label>
            <select
              id="feedback_timing"
              name="feedback_timing"
              defaultValue={(p.feedback_timing as string) ?? "immediate"}
              className="field-input"
            >
              <option value="immediate">Direkt efter varje fråga</option>
              <option value="end_of_test">Först när hela testet är klart</option>
            </select>
          </div>

          <div>
            <label htmlFor="feedback_mode" className="field-label">
              Feedback vid rättning
            </label>
            <select
              id="feedback_mode"
              name="feedback_mode"
              defaultValue={(p.feedback_mode as string) ?? "result_and_explanation"}
              className="field-input"
            >
              <option value="result_only">Bara rätt/fel</option>
              <option value="result_and_answer">Rätt/fel + rätt svar</option>
              <option value="result_and_explanation">Rätt/fel + kort förklaring</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="text_amount" className="field-label">
                Textmängd
              </label>
              <select
                id="text_amount"
                name="text_amount"
                defaultValue={(p.text_amount as string) ?? "normal"}
                className="field-input"
              >
                <option value="minimal">Minimal</option>
                <option value="short">Kort</option>
                <option value="normal">Normal</option>
              </select>
            </div>
            <div>
              <label htmlFor="text_size" className="field-label">
                Textstorlek
              </label>
              <select
                id="text_size"
                name="text_size"
                defaultValue={(p.text_size as string) ?? "normal"}
                className="field-input"
              >
                <option value="normal">Normal</option>
                <option value="large">Stor</option>
                <option value="extra_large">Extra stor</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="questions_per_session" className="field-label">
              Frågor per fokuspass
            </label>
            <select
              id="questions_per_session"
              name="questions_per_session"
              defaultValue={String(p.questions_per_session ?? 5)}
              className="field-input"
            >
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="animation_level" className="field-label">
                Animation
              </label>
              <select
                id="animation_level"
                name="animation_level"
                defaultValue={(p.animation_level as string) ?? "normal"}
                className="field-input"
              >
                <option value="off">Av</option>
                <option value="minimal">Minimal</option>
                <option value="normal">Normal</option>
              </select>
            </div>
            <div>
              <label htmlFor="sound_mode" className="field-label">
                Ljud
              </label>
              <select
                id="sound_mode"
                name="sound_mode"
                defaultValue={(p.sound_mode as string) ?? "off"}
                className="field-input"
              >
                <option value="off">Av</option>
                <option value="feedback">Feedback</option>
                <option value="reading_aloud">Uppläsning</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              name="reading_aloud"
              defaultChecked={Boolean(p.reading_aloud)}
              className="h-4 w-4 rounded border-sand-deep"
            />
            Uppläsning av frågor och svarsalternativ
          </label>

          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              name="predictable_ui"
              defaultChecked={Boolean(p.predictable_ui)}
              className="h-4 w-4 rounded border-sand-deep"
            />
            Extra förutsägbart gränssnitt (samma knappar på samma plats)
          </label>

          <div>
            <label htmlFor="visual_effect_level" className="field-label">
              Visuella effekter
            </label>
            <select
              id="visual_effect_level"
              name="visual_effect_level"
              defaultValue={(p.visual_effect_level as string) ?? "normal"}
              className="field-input"
            >
              <option value="minimal">Minimal</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          <button type="submit" className="btn-primary w-full">
            <Icon name="spara" />
            Spara
          </button>
        </form>
      </section>
    </div>
  );
}
