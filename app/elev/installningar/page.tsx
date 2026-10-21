import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateOwnFeedbackTimingAction } from "@/app/actions/studentSettings";
import { Icon } from "@/components/Icon";

export default async function ElevInstallningarPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: prefs } = await supabase
    .from("student_preferences")
    .select("feedback_timing")
    .eq("student_id", profile.id)
    .maybeSingle();

  return (
    <div>
      <Link href="/elev" className="link-back">
        <Icon name="tillbaka" size={16} />
        Tillbaka
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-navy">
        Inställningar
      </h1>

      {searchParams.saved && (
        <p className="mt-4 rounded-xl bg-seafoam px-3 py-2 text-sm text-ocean-dark">
          Sparat!
        </p>
      )}

      <form action={updateOwnFeedbackTimingAction} className="notebook-card mt-6 space-y-4 p-6">
        <div>
          <p className="field-label">Rätt svar</p>
          <p className="mt-1 mb-3 text-xs text-navy/50">
            Vill du se om du svarade rätt direkt, eller vänta tills du är
            klar med hela testet?
          </p>

          <label className="flex items-start gap-3 rounded-xl border-2 border-sand-deep p-3 has-[:checked]:border-ocean">
            <input
              type="radio"
              name="feedback_timing"
              value="immediate"
              defaultChecked={(prefs?.feedback_timing ?? "immediate") === "immediate"}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-navy">
                Direkt efter varje fråga
              </span>
              <span className="block text-xs text-navy/50">
                Du ser om du hade rätt innan du går vidare.
              </span>
            </span>
          </label>

          <label className="mt-2 flex items-start gap-3 rounded-xl border-2 border-sand-deep p-3 has-[:checked]:border-ocean">
            <input
              type="radio"
              name="feedback_timing"
              value="end_of_test"
              defaultChecked={prefs?.feedback_timing === "end_of_test"}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-navy">
                Efter hela testet
              </span>
              <span className="block text-xs text-navy/50">
                Du svarar på alla frågor först, sen ser du en genomgång.
              </span>
            </span>
          </label>
        </div>

        <button type="submit" className="btn-primary w-full">
          <Icon name="spara" />
          Spara
        </button>
      </form>
    </div>
  );
}
