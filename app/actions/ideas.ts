"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getIdeaSuggestion } from "@/lib/ai/ideaSuggestion";
import { findIdeaGenre, findIdeaLength } from "@/lib/ideas/genres";

/** Tak per elev och dygn — håller nere AI-kostnaden om någon klickar loss. */
const MAX_SUGGESTIONS_PER_DAY = 20;
const MAX_ANSWER_LENGTH = 300;

export type IdeaSuggestionResult =
  | { ok: true; title: string; text: string; ideas: string[]; left: number }
  | { ok: false; message: string };

/**
 * Idéverkstaden: tar elevens svar, ber AI:n om ett exempel och sparar det
 * så att admin kan se vad eleven har laborerat med.
 */
export async function generateIdeaAction(params: {
  genreId: string;
  lengthId: string;
  answers: Record<string, string>;
}): Promise<IdeaSuggestionResult> {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const genre = findIdeaGenre(String(params.genreId ?? ""));
  if (!genre) {
    return { ok: false, message: "Välj vilken sorts text du ska skriva." };
  }
  const length = findIdeaLength(String(params.lengthId ?? ""));

  // Bara svar på frågor som faktiskt hör till texttypen följer med.
  const answers: Record<string, string> = {};
  for (const q of genre.questions) {
    const value = params.answers?.[q.id];
    if (typeof value === "string" && value.trim()) {
      answers[q.id] = value.trim().slice(0, MAX_ANSWER_LENGTH);
    }
  }

  const missing = genre.questions.find((q) => q.required && !answers[q.id]);
  if (missing) {
    return { ok: false, message: `Svara först på: ${missing.label}` };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("idea_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", profile.id)
    .gte("created_at", since);

  const used = count ?? 0;
  if (used >= MAX_SUGGESTIONS_PER_DAY) {
    return {
      ok: false,
      message:
        "Du har fått alla förslag för i dag. Titta igenom dem du redan har – och testa att skriva en egen början!",
    };
  }

  try {
    const suggestion = await getIdeaSuggestion({
      genre,
      answers,
      minChars: length.minChars,
      maxChars: length.maxChars,
    });

    const { error } = await supabase.from("idea_suggestions").insert({
      student_id: profile.id,
      genre: genre.id,
      answers: { ...answers, langd: length.id },
      title: suggestion.title || null,
      text: suggestion.text,
    });
    if (error) console.error("Kunde inte spara idéförslaget:", error);

    return {
      ok: true,
      title: suggestion.title,
      text: suggestion.text,
      ideas: suggestion.ideas,
      left: Math.max(0, MAX_SUGGESTIONS_PER_DAY - used - 1),
    };
  } catch (err) {
    console.error("Idéförslaget misslyckades:", err);
    return { ok: false, message: "Det gick inte att ta fram ett förslag just nu. Försök igen om en stund." };
  }
}
