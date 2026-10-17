"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { layoutCrossword, normalizeAnswer } from "@/lib/nutid/layout";
import { currentWeekStart } from "@/lib/nutid/week";
import type { NutidEntry } from "@/lib/nutid/types";

/* ───────────── Elev ───────────── */

/**
 * Sparar hur långt eleven kommit i ett kryss. Anropas efter varje löst ord
 * så att halvlösta kryss också räknas i veckoremsan.
 */
export async function saveNutidProgressAction(params: {
  kryssId: string;
  solved: string[];
  hintsUsed: number;
}): Promise<{ ok: boolean }> {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const { data: kryss } = await supabase
    .from("nutidskryss")
    .select("id, entries")
    .eq("id", params.kryssId)
    .eq("status", "published")
    .maybeSingle();
  if (!kryss) return { ok: false };

  const answers = new Set(((kryss.entries ?? []) as NutidEntry[]).map((e) => e.answer));
  const solved = [...new Set(params.solved.map(normalizeAnswer))].filter((a) => answers.has(a));
  const total = answers.size;
  const completed = total > 0 && solved.length === total;
  const hints = Math.max(0, Math.min(200, Math.floor(params.hintsUsed) || 0));

  const { data: existing } = await supabase
    .from("nutidskryss_attempts")
    .select("id, completed_at")
    .eq("student_id", profile.id)
    .eq("kryss_id", kryss.id)
    .maybeSingle();

  const values = {
    solved,
    solved_count: solved.length,
    total,
    hints_used: hints,
    completed_at: completed ? (existing?.completed_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("nutidskryss_attempts").update(values).eq("id", existing.id)
    : await supabase.from("nutidskryss_attempts").insert({
        ...values,
        student_id: profile.id,
        kryss_id: kryss.id,
        // Veckan då eleven spelade — det är den som syns i veckoremsan.
        week_start: currentWeekStart(),
      });

  if (error) {
    console.error("Kunde inte spara nutidskryss:", error);
    return { ok: false };
  }

  revalidatePath("/elev/nutid");
  revalidatePath("/elev");
  return { ok: true };
}

/* ───────────── Redaktör ───────────── */

async function requireEditor() {
  const profile = await requireProfile("admin");
  const supabase = createClient();
  const { data: isEditor } = await supabase.rpc("is_content_editor");
  if (isEditor !== true) redirect("/admin");
  return { profile, supabase };
}

function done(message?: string): never {
  revalidatePath("/admin/nutidskryss");
  revalidatePath("/elev/nutid");
  redirect(message ? `/admin/nutidskryss?meddelande=${encodeURIComponent(message)}` : "/admin/nutidskryss");
}

export async function requestNutidDraftAction() {
  const { supabase } = await requireEditor();
  const { error } = await supabase.rpc("request_nutidskryss_generation");
  done(
    error
      ? error.message
      : "Utkastet skapas. Det tar ungefär en minut — ladda om sidan sedan.",
  );
}

export async function publishNutidAction(kryssId: string) {
  const { profile, supabase } = await requireEditor();

  const { data: kryss } = await supabase
    .from("nutidskryss")
    .select("id, week_start, status, entries")
    .eq("id", kryssId)
    .maybeSingle();
  if (!kryss || kryss.status !== "draft") done("Hittade inget utkast att publicera.");
  if (((kryss.entries ?? []) as NutidEntry[]).length < 4) done("Krysset behöver minst fyra ord.");

  // Bara ett nyhetskryss per vecka: ett tidigare publicerat blir utkast igen.
  await supabase
    .from("nutidskryss")
    .update({ status: "draft", published_at: null })
    .eq("status", "published")
    .eq("is_evergreen", false)
    .eq("week_start", kryss.week_start)
    .neq("id", kryss.id);

  const { error } = await supabase
    .from("nutidskryss")
    .update({ status: "published", published_at: new Date().toISOString(), reviewed_by: profile.id })
    .eq("id", kryss.id);

  done(error ? `Kunde inte publicera: ${error.message}` : "Publicerat! Eleverna ser krysset nu.");
}

export async function rejectNutidAction(kryssId: string) {
  const { profile, supabase } = await requireEditor();
  await supabase
    .from("nutidskryss")
    .update({ status: "rejected", reviewed_by: profile.id, published_at: null })
    .eq("id", kryssId)
    .eq("is_evergreen", false);
  done("Utkastet är avvisat. Eleverna får ett reservkryss tills ett nytt publiceras.");
}

export async function updateNutidClueAction(kryssId: string, answer: string, formData: FormData) {
  const { supabase } = await requireEditor();
  const clue = String(formData.get("clue") ?? "").trim().slice(0, 200);
  if (!clue) done("Ledtråden kan inte vara tom.");
  if (clue.toUpperCase().includes(answer)) done(`Ledtråden avslöjar svaret ${answer}.`);

  const { data: kryss } = await supabase.from("nutidskryss").select("entries").eq("id", kryssId).maybeSingle();
  if (!kryss) done("Hittade inte krysset.");

  const entries = ((kryss.entries ?? []) as NutidEntry[]).map((e) => (e.answer === answer ? { ...e, clue } : e));
  const { error } = await supabase.from("nutidskryss").update({ entries }).eq("id", kryssId);
  done(error ? `Kunde inte spara: ${error.message}` : "Ledtråden är sparad.");
}

export async function removeNutidEntryAction(kryssId: string, answer: string) {
  const { supabase } = await requireEditor();
  const { data: kryss } = await supabase.from("nutidskryss").select("entries").eq("id", kryssId).maybeSingle();
  if (!kryss) done("Hittade inte krysset.");

  const remaining = ((kryss.entries ?? []) as NutidEntry[]).filter((e) => e.answer !== answer);
  if (remaining.length < 4) done("Krysset behöver minst fyra ord. Avvisa hellre hela utkastet.");

  // Lägg ut krysset på nytt utan ordet. Hänger inte resten ihop längre
  // tas ordet inte bort — då skulle andra ord försvinna utan att det syns.
  const layout = layoutCrossword(remaining.map((e) => e.answer));
  if (layout.placements.length < remaining.length) {
    done(`${answer} håller ihop krysset och kan inte tas bort. Ändra ledtråden istället, eller avvisa utkastet.`);
  }

  const { error } = await supabase.from("nutidskryss").update({ entries: remaining, layout }).eq("id", kryssId);
  done(error ? `Kunde inte ta bort: ${error.message}` : `${answer} är borttaget.`);
}
