"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rewordQuestions, type OriginalQuestion } from "@/lib/ai/rewordQuestions";

const pagePath = (studySetId: string) => `/admin/omformulera/${studySetId}`;

function done(studySetId: string, message?: string): never {
  revalidatePath(pagePath(studySetId));
  revalidatePath("/elev", "layout");
  redirect(message ? `${pagePath(studySetId)}?meddelande=${encodeURIComponent(message)}` : pagePath(studySetId));
}

async function requireRewordAccess(studySetId: string) {
  const profile = await requireProfile("admin");
  const supabase = createClient();
  const { data: allowed } = await supabase.rpc("can_reword_study_set", { p_study_set_id: studySetId });
  if (allowed !== true) redirect("/admin");
  return { profile, supabase };
}

/**
 * Skapar en ny omformulerad version som utkast. Eleverna ser ingenting
 * förrän föräldern har tittat igenom och aktiverat den.
 */
export async function generateRewordingAction(studySetId: string) {
  const { profile, supabase } = await requireRewordAccess(studySetId);

  const { data: busy } = await supabase
    .from("test_rewordings")
    .select("id")
    .eq("study_set_id", studySetId)
    .eq("admin_id", profile.id)
    .eq("status", "generating")
    .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(1);
  if (busy?.length) done(studySetId, "En omformulering pågår redan. Ladda om sidan om en minut.");

  // Ett tidigare utkast ersätts av det nya.
  await supabase
    .from("test_rewordings")
    .delete()
    .eq("study_set_id", studySetId)
    .eq("admin_id", profile.id)
    .in("status", ["draft", "failed", "generating"]);

  const [{ data: questions }, { data: active }, { count: rounds }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question, question_type, answer_options, correct_answer, accepted_answers, explanation")
      .eq("study_set_id", studySetId)
      .eq("status", "published")
      .order("created_at"),
    supabase
      .from("test_rewordings")
      .select("id")
      .eq("study_set_id", studySetId)
      .eq("admin_id", profile.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("test_rewordings")
      .select("id", { count: "exact", head: true })
      .eq("study_set_id", studySetId)
      .eq("admin_id", profile.id),
  ]);

  if (!questions?.length) done(studySetId, "Testet har inga publicerade frågor att formulera om.");

  // Den aktiva versionens formuleringar skickas med så att nästa omgång blir annorlunda.
  const previousByQuestion = new Map<string, string>();
  if (active) {
    const { data: prev } = await supabase
      .from("question_variants")
      .select("question_id, question")
      .eq("rewording_id", active.id);
    for (const p of prev ?? []) previousByQuestion.set(p.question_id, p.question);
  }

  const { data: rewording, error: createError } = await supabase
    .from("test_rewordings")
    .insert({
      study_set_id: studySetId,
      admin_id: profile.id,
      status: "generating",
      round: (rounds ?? 0) + 1,
    })
    .select("id")
    .single();
  if (createError || !rewording) done(studySetId, `Kunde inte starta: ${createError?.message ?? "okänt fel"}`);

  const originals: OriginalQuestion[] = questions.map((q) => ({
    id: q.id,
    question: q.question,
    question_type: q.question_type,
    answer_options: Array.isArray(q.answer_options) ? (q.answer_options as string[]) : null,
    correct_answer: q.correct_answer,
    accepted_answers: Array.isArray(q.accepted_answers) ? (q.accepted_answers as string[]) : null,
    explanation: q.explanation,
    previous: previousByQuestion.get(q.id) ?? null,
  }));

  let message: string;
  try {
    const { reworded, failedBatches } = await rewordQuestions(originals);
    if (!reworded.length) throw new Error("AI:n kunde inte formulera om några frågor.");

    const { error: insertError } = await supabase.from("question_variants").insert(
      reworded.map((r) => ({ ...r, rewording_id: rewording.id })),
    );
    if (insertError) throw new Error(insertError.message);

    await supabase.from("test_rewordings").update({ status: "draft" }).eq("id", rewording.id);
    const kept = originals.length - reworded.length;
    message =
      `${reworded.length} av ${originals.length} frågor har fått nya formuleringar. Titta igenom och aktivera.` +
      (kept ? ` ${kept} behåller sin gamla formulering${failedBatches ? " (en del av AI-anropet misslyckades)" : ""}.` : "");
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await supabase.from("test_rewordings").update({ status: "failed", error }).eq("id", rewording.id);
    message = `Det gick inte att formulera om just nu: ${error}`;
  }

  done(studySetId, message);
}

export async function activateRewordingAction(studySetId: string, rewordingId: string) {
  const { profile, supabase } = await requireRewordAccess(studySetId);

  await supabase
    .from("test_rewordings")
    .update({ status: "archived" })
    .eq("study_set_id", studySetId)
    .eq("admin_id", profile.id)
    .eq("status", "active");

  const { error } = await supabase
    .from("test_rewordings")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", rewordingId)
    .eq("admin_id", profile.id)
    .eq("status", "draft");

  done(studySetId, error ? `Kunde inte aktivera: ${error.message}` : "Aktiverat! Eleven ser en ikon om att testet är uppdaterat.");
}

export async function discardRewordingAction(studySetId: string, rewordingId: string) {
  const { profile, supabase } = await requireRewordAccess(studySetId);
  await supabase
    .from("test_rewordings")
    .delete()
    .eq("id", rewordingId)
    .eq("admin_id", profile.id)
    .in("status", ["draft", "failed"]);
  done(studySetId, "Utkastet är borttaget.");
}

export async function revertToOriginalAction(studySetId: string) {
  const { profile, supabase } = await requireRewordAccess(studySetId);
  await supabase
    .from("test_rewordings")
    .update({ status: "archived" })
    .eq("study_set_id", studySetId)
    .eq("admin_id", profile.id)
    .eq("status", "active");
  done(studySetId, "Eleven får originalformuleringarna igen.");
}

/** Föräldern justerar en enskild omformulering för hand. */
export async function updateVariantAction(studySetId: string, variantId: string, formData: FormData) {
  const { supabase } = await requireRewordAccess(studySetId);

  const { data: variant } = await supabase
    .from("question_variants")
    .select("id, answer_options, correct_answer, questions(question_type, answer_options, correct_answer)")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) done(studySetId, "Hittade inte frågan.");

  const original = variant.questions as unknown as {
    question_type: string;
    answer_options: string[] | null;
    correct_answer: string;
  } | null;

  const question = String(formData.get("question") ?? "").trim().slice(0, 400);
  const explanation = String(formData.get("explanation") ?? "").trim().slice(0, 400) || null;
  if (question.length < 5) done(studySetId, "Frågan behöver minst några ord.");

  const update: Record<string, unknown> = { question, explanation };

  if (original?.question_type === "multiple_choice" && Array.isArray(original.answer_options)) {
    const correctIndex = original.answer_options.indexOf(original.correct_answer);
    const options = original.answer_options.map((_, i) => String(formData.get(`option_${i}`) ?? "").trim().slice(0, 200));
    if (options.some((o) => !o)) done(studySetId, "Alla svarsalternativ måste ha text.");
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      done(studySetId, "Två svarsalternativ blev likadana. Ändra så att de skiljer sig.");
    }
    update.answer_options = options;
    // Rätt alternativ ligger alltid på samma plats som i originalet.
    update.correct_answer = options[correctIndex];
  }

  const { error } = await supabase.from("question_variants").update(update).eq("id", variantId);
  done(studySetId, error ? `Kunde inte spara: ${error.message}` : "Ändringen är sparad.");
}

/** Behåll originalet för just den här frågan i versionen. */
export async function dropVariantAction(studySetId: string, variantId: string) {
  const { supabase } = await requireRewordAccess(studySetId);
  await supabase.from("question_variants").delete().eq("id", variantId);
  done(studySetId, "Frågan behåller sin gamla formulering.");
}
