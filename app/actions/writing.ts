"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getWritingFeedback } from "@/lib/ai/writingFeedback";
import {
  countWords,
  isTimeLevel,
  parseWritingContent,
  resultFromParts,
  resultFromTraining,
  type PartStatus,
  type TimeLevel,
  type WritingContent,
  type WritingFeedback,
  type WritingResult,
} from "@/lib/writing/types";

/** Tak per elev och dygn — håller nere AI-kostnaden om någon klickar loss. */
const MAX_AI_FEEDBACK_PER_DAY = 15;
const MAX_TEXT_LENGTH = 6000;
const MIN_WORDS_FOR_FEEDBACK = 12;

/**
 * Hämtar skrivövningen via elevens egen RLS-behörighet: finns raden inte
 * (inte tilldelad, fel typ, opublicerad) får eleven inget tillbaka.
 */
async function loadWritingSet(studySetId: string): Promise<WritingContent | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("study_sets")
    .select("id, set_type, status, writing_content")
    .eq("id", studySetId)
    .eq("set_type", "skriv")
    .eq("status", "published")
    .maybeSingle();

  return data ? parseWritingContent(data.writing_content) : null;
}

/** Steg D (Träna): sparar bara utfallet så appen minns vad eleven redan kan. */
/** Aktiv skrivtid från webbläsaren, högst 90 minuter per inlämning. */
function clampSeconds(value: unknown): number {
  return Math.max(0, Math.min(5400, Math.round(Number(value) || 0)));
}

export async function saveTrainingResultAction(params: {
  studySetId: string;
  level: TimeLevel;
  correct: number;
  total: number;
  activeSeconds?: number;
}): Promise<{ result: WritingResult }> {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const total = Math.max(0, Math.min(20, Math.floor(params.total)));
  const correct = Math.max(0, Math.min(total, Math.floor(params.correct)));
  const result = resultFromTraining(correct, total);

  const content = await loadWritingSet(params.studySetId);
  if (!content || !isTimeLevel(params.level)) {
    return { result };
  }

  const { error } = await supabase.from("writing_submissions").insert({
    student_id: profile.id,
    study_set_id: params.studySetId,
    mode: "trana",
    time_level: params.level,
    result,
    feedback: { correct, total },
    active_seconds: clampSeconds(params.activeSeconds),
  });
  if (error) console.error("Kunde inte spara träningsresultat:", error);

  revalidatePath(`/elev/skrivklura/${params.studySetId}`);
  revalidatePath("/elev/skrivklura");
  return { result };
}

/**
 * Steg E (Gör själv) och F (Testa utan hjälp): sparar elevens text och
 * hämtar kort AI-feedback. Går AI-anropet inte igenom sparas texten ändå
 * och eleven får en egen checklista — texten ska aldrig gå förlorad.
 */
export async function submitWritingAction(params: {
  studySetId: string;
  mode: "gor_sjalv" | "testa";
  level: TimeLevel;
  topic: string;
  parts: Record<string, string> | null;
  text: string;
  hintsUsed: number;
  activeSeconds?: number;
}): Promise<
  | { ok: true; result: WritingResult; feedback: WritingFeedback }
  | { ok: false; message: string }
> {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const content = await loadWritingSet(params.studySetId);
  if (!content || !isTimeLevel(params.level)) {
    return { ok: false, message: "Hittade inte skrivövningen. Gå tillbaka och försök igen." };
  }
  if (params.mode !== "gor_sjalv" && params.mode !== "testa") {
    return { ok: false, message: "Något gick snett. Försök igen." };
  }

  const text = String(params.text ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  const wordCount = countWords(text);
  if (wordCount < MIN_WORDS_FOR_FEEDBACK) {
    return {
      ok: false,
      message: "Skriv ett par meningar till, så får du feedback sedan.",
    };
  }

  // Byggklossarna sparas bara med de nycklar som faktiskt hör till övningen.
  const cleanParts: Record<string, string> = {};
  if (params.parts) {
    for (const block of content.blocks) {
      const value = params.parts[block.id];
      if (typeof value === "string" && value.trim()) {
        cleanParts[block.id] = value.trim().slice(0, 1500);
      }
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("writing_submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", profile.id)
    .neq("mode", "trana")
    .gte("created_at", since);

  let feedback: WritingFeedback;

  try {
    if ((recentCount ?? 0) >= MAX_AI_FEEDBACK_PER_DAY) {
      throw new Error("Dagens tak för AI-feedback är nått");
    }
    const ai = await getWritingFeedback({
      genre: content.genre,
      language: content.language,
      blocks: content.blocks,
      text,
    });
    feedback = {
      strength: ai.strength,
      nextStep: ai.nextStep,
      parts: content.blocks.map((b) => ({
        id: b.id,
        label: b.label,
        status: ai.parts[b.id],
      })),
      fallback: false,
      careNote: ai.careNote,
    };
  } catch (err) {
    console.error("AI-feedback misslyckades, visar egen checklista:", err);
    // Reservläge: i Gör själv vet vi vilka klossar eleven fyllde i. I
    // provläget vet vi inget om delarna, så eleven bockar av själv.
    const parts: { id: string; label: string; status: PartStatus }[] =
      params.mode === "gor_sjalv"
        ? content.blocks.map((b) => ({
            id: b.id,
            label: b.label,
            status: cleanParts[b.id] ? "finns" : "saknas",
          }))
        : [];
    feedback = {
      strength: "Du har skrivit en hel text från början till slut. Det är det svåraste steget.",
      nextStep: "",
      parts,
      fallback: true,
      careNote: false,
    };
  }

  const result: WritingResult = feedback.parts.length
    ? resultFromParts(feedback.parts)
    : "nastan";

  const { error } = await supabase.from("writing_submissions").insert({
    student_id: profile.id,
    study_set_id: params.studySetId,
    mode: params.mode,
    time_level: params.level,
    result,
    topic: String(params.topic ?? "").trim().slice(0, 200) || null,
    parts: Object.keys(cleanParts).length ? cleanParts : null,
    full_text: text,
    word_count: wordCount,
    hints_used: Math.max(0, Math.min(99, Math.floor(params.hintsUsed) || 0)),
    feedback,
    active_seconds: clampSeconds(params.activeSeconds),
  });
  if (error) console.error("Kunde inte spara elevens text:", error);

  revalidatePath(`/elev/skrivklura/${params.studySetId}`);
  revalidatePath("/elev/skrivklura");
  return { ok: true, result, feedback };
}
