"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/nutid/week";
import { MIN_QUESTIONS, type NutidQuestion } from "@/lib/nutid/types";

/* ───────────── Elev ───────────── */

/**
 * Sparar elevens svar efter varje fråga, så att ett halvgjort kryss
 * finns kvar och syns i veckoremsan. Rättningen görs här mot facit.
 */
export async function saveNutidAnswersAction(params: {
  kryssId: string;
  answers: (number | null)[];
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

  const questions = (kryss.entries ?? []) as NutidQuestion[];
  const answers = questions.map((_, i) => {
    const a = params.answers[i];
    return a === 0 || a === 1 || a === 2 ? a : null;
  });
  const correct = answers.filter((a, i) => a !== null && a === questions[i].correct).length;
  const completed = questions.length > 0 && answers.every((a) => a !== null);

  const { data: existing } = await supabase
    .from("nutidskryss_attempts")
    .select("id, completed_at")
    .eq("student_id", profile.id)
    .eq("kryss_id", kryss.id)
    .maybeSingle();

  // Ett inlämnat kryss ändras inte i efterhand (som på en kupong).
  if (existing?.completed_at) return { ok: true };

  const values = {
    answers,
    solved_count: correct,
    total: questions.length,
    completed_at: completed ? new Date().toISOString() : null,
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

async function loadEntries(supabase: ReturnType<typeof createClient>, kryssId: string) {
  const { data } = await supabase.from("nutidskryss").select("entries").eq("id", kryssId).maybeSingle();
  if (!data) done("Hittade inte krysset.");
  return (data.entries ?? []) as NutidQuestion[];
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
  if (((kryss.entries ?? []) as NutidQuestion[]).length < MIN_QUESTIONS) {
    done(`Krysset behöver minst ${MIN_QUESTIONS} frågor.`);
  }

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
  done("Krysset är avvisat. Eleverna får ett reservkryss tills ett nytt publiceras.");
}

export async function updateNutidQuestionAction(kryssId: string, index: number, formData: FormData) {
  const { supabase } = await requireEditor();
  const entries = await loadEntries(supabase, kryssId);
  const current = entries[index];
  if (!current) done("Hittade inte frågan.");

  const question = String(formData.get("question") ?? "").trim().slice(0, 300);
  const options = [0, 1, 2].map((i) => String(formData.get(`option_${i}`) ?? "").trim().slice(0, 150));
  const correct = Number(formData.get("correct"));
  const explanation = String(formData.get("explanation") ?? "").trim().slice(0, 300);

  if (question.length < 5) done("Frågan behöver minst några ord.");
  if (options.some((o) => !o)) done("Alla tre alternativen måste ha text.");
  if (new Set(options.map((o) => o.toLowerCase())).size !== 3) done("Två alternativ blev likadana.");
  if (![0, 1, 2].includes(correct)) done("Välj vilket alternativ som är rätt.");

  entries[index] = { ...current, question, options, correct, explanation };
  const { error } = await supabase.from("nutidskryss").update({ entries }).eq("id", kryssId);
  done(error ? `Kunde inte spara: ${error.message}` : `Fråga ${index + 1} är sparad.`);
}

export async function removeNutidQuestionAction(kryssId: string, index: number) {
  const { supabase } = await requireEditor();
  const entries = await loadEntries(supabase, kryssId);
  if (entries.length - 1 < MIN_QUESTIONS) {
    done(`Krysset behöver minst ${MIN_QUESTIONS} frågor. Ändra frågan istället, eller avvisa utkastet.`);
  }
  const remaining = entries.filter((_, i) => i !== index);
  const { error } = await supabase.from("nutidskryss").update({ entries: remaining }).eq("id", kryssId);
  done(error ? `Kunde inte ta bort: ${error.message}` : `Fråga ${index + 1} är borttagen.`);
}
