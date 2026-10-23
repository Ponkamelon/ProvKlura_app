"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateQuestionsFromText } from "@/lib/ai/generateQuestions";
import { jaccardSimilarity, DUPLICATE_THRESHOLD } from "@/lib/ai/dedupe";
import { loadCandidatePoints, pointLabel, resolveKnowledgePoints } from "@/lib/knowledge/points";

const MAX_WORDS_PER_PART = 700;
const MAX_PARTS = 4;

/**
 * Delar upp stort material i lagom stora bitar (~700 ord, ca 12–18 frågor
 * värt) så att varje AI-anrop hålls under Vercels tidsgräns och risken
 * för avklippta svar minskar. Delar på styckegränser i första hand.
 * Begränsat till max 4 delar — är materialet ännu större får varje del
 * bära lite mer, hellre än ett femte+ prov admin aldrig hinner granska.
 */
function splitMaterialIntoParts(text: string): string[] {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= MAX_WORDS_PER_PART) return [text];

  const estimatedParts = Math.min(
    MAX_PARTS,
    Math.ceil(wordCount / MAX_WORDS_PER_PART),
  );
  const targetWordsPerPart = Math.ceil(wordCount / estimatedParts);

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const parts: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = para.trim().split(/\s+/).filter(Boolean).length;

    if (
      currentWords + paraWords > targetWordsPerPart &&
      current.length > 0 &&
      parts.length < estimatedParts - 1
    ) {
      parts.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }

    current.push(para);
    currentWords += paraWords;
  }
  if (current.length) parts.push(current.join("\n\n"));

  return parts.length ? parts : [text];
}

/**
 * Kör AI-genereringen och sparar frågorna. Dublettkontroll (sektion 36)
 * mot både redan sparade frågor och andra frågor i samma batch.
 * verification_status sätts från confidence_score (sektion 34) — status
 * är alltid "draft" tills admin explicit publicerar (sektion 38).
 */
async function generateAndSaveQuestions(params: {
  studySetId: string;
  materialId: string;
  text: string;
  subjectName: string;
  chapterTitle: string;
  gradeLevel: number;
}) {
  const { studySetId, materialId, text, subjectName, chapterTitle, gradeLevel } = params;
  const supabase = createClient();

  // Steg 0: AI:n väljer kunskapspunkt ur banken (och setets egna punkter).
  const candidates = await loadCandidatePoints(supabase, subjectName, studySetId, chapterTitle);

  const generated = await generateQuestionsFromText({
    text,
    subjectName,
    chapterTitle,
    gradeLevel,
    knowledgePoints: candidates.map(pointLabel),
  });

  const { data: existing } = await supabase
    .from("questions")
    .select("question")
    .eq("study_set_id", studySetId);

  const existingTexts = existing?.map((e) => e.question) ?? [];
  const accepted: typeof generated = [];

  for (const q of generated) {
    if (!q?.question || !q?.correct_answer) continue;
    const isDuplicate = [...existingTexts, ...accepted.map((a) => a.question)].some(
      (t) => jaccardSimilarity(t, q.question) > DUPLICATE_THRESHOLD,
    );
    if (!isDuplicate) accepted.push(q);
  }

  if (!accepted.length) return;

  const pointIds = await resolveKnowledgePoints(supabase, {
    studySetId,
    subjectName,
    chapterTitle,
    candidates,
    choices: accepted.map((q) => ({ knowledgePoint: q.knowledge_point, knowledgeUnit: q.knowledge_unit })),
  });

  const rows = accepted.map((q, i) => ({
    study_set_id: studySetId,
    source_material_id: materialId,
    knowledge_unit: q.knowledge_unit ?? null,
    knowledge_point_id: pointIds[i],
    question_type: q.type,
    question: q.question,
    answer_options: q.type === "multiple_choice" && q.options ? q.options : null,
    correct_answer: q.correct_answer,
    accepted_answers: q.accepted_answers?.length ? q.accepted_answers : null,
    explanation: q.explanation ?? null,
    importance: q.importance ?? "medium",
    grade_level: gradeLevel,
    confidence_score: typeof q.confidence_score === "number" ? q.confidence_score : 0.75,
    verification_status:
      (q.confidence_score ?? 0) >= 0.9 ? ("verified" as const) : ("needs_review" as const),
    status: "draft" as const,
  }));

  const { error } = await supabase.from("questions").insert(rows);
  if (error) throw error;
}

export async function createStudySetAction(formData: FormData) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const subjectInput = String(formData.get("subject") ?? "").trim();
  const chapterTitle = String(formData.get("chapterTitle") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || chapterTitle;
  const gradeLevel = Number(formData.get("gradeLevel"));
  const examDate = String(formData.get("examDate") ?? "").trim() || null;
  const materialText = String(formData.get("materialText") ?? "").trim();

  if (!subjectInput || !chapterTitle || !gradeLevel || !materialText) {
    redirect(
      `/admin/prov/ny?error=${encodeURIComponent("Fyll i ämne, kapitel, årskurs och material.")}`,
    );
  }

  let { data: subject } = await supabase
    .from("subjects")
    .select("*")
    .eq("admin_id", profile.id)
    .ilike("name", subjectInput)
    .maybeSingle();

  if (!subject) {
    const { data: newSubject, error: subjectError } = await supabase
      .from("subjects")
      .insert({ admin_id: profile.id, name: subjectInput })
      .select()
      .single();

    if (subjectError || !newSubject) {
      redirect(
        `/admin/prov/ny?error=${encodeURIComponent(
          `Kunde inte skapa ämnet: ${subjectError?.message ?? "okänt fel"}`,
        )}`,
      );
    }
    subject = newSubject;
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({ subject_id: subject!.id, title: chapterTitle })
    .select()
    .single();

  if (chapterError || !chapter) {
    redirect(
      `/admin/prov/ny?error=${encodeURIComponent(
        `Kunde inte skapa kapitlet: ${chapterError?.message ?? "okänt fel"}`,
      )}`,
    );
  }

  const parts = splitMaterialIntoParts(materialText);
  const isMultiPart = parts.length > 1;

  const createdStudySetIds: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const partTitle = isMultiPart ? `${title} (Del ${i + 1})` : title;

    const { data: studySet, error: studySetError } = await supabase
      .from("study_sets")
      .insert({
        chapter_id: chapter!.id,
        admin_id: profile.id,
        title: partTitle,
        exam_date: examDate,
        grade_level: gradeLevel,
        status: "draft",
      })
      .select()
      .single();

    if (studySetError || !studySet) {
      console.error(`Kunde inte skapa del ${i + 1}:`, studySetError);
      continue;
    }

    createdStudySetIds.push(studySet.id);

    const { data: material, error: materialError } = await supabase
      .from("source_material")
      .insert({
        study_set_id: studySet.id,
        material_type: "pasted_text",
        extracted_text: parts[i],
        // Bara del 1 genereras direkt (nedan). Resten väntar tills admin
        // öppnar dem — annars riskerar flera AI-anrop i rad i samma
        // knapptryckning att tillsammans krocka med tidsgränsen.
        processing_status: i === 0 ? "processing" : "uploaded",
      })
      .select()
      .single();

    if (materialError || !material) {
      console.error(`Kunde inte spara material för del ${i + 1}:`, materialError);
      continue;
    }

    if (i === 0) {
      try {
        await generateAndSaveQuestions({
          studySetId: studySet.id,
          materialId: material.id,
          text: parts[i],
          subjectName: subject!.name,
          chapterTitle: partTitle,
          gradeLevel,
        });
        await supabase
          .from("source_material")
          .update({ processing_status: "ready" })
          .eq("id", material.id);
      } catch (err) {
        console.error("AI-frågegenerering misslyckades (createStudySetAction):", err);
        await supabase
          .from("source_material")
          .update({ processing_status: "error" })
          .eq("id", material.id);
      }
    }
  }

  revalidatePath("/admin/prov");

  if (!createdStudySetIds.length) {
    redirect(
      `/admin/prov/ny?error=${encodeURIComponent("Kunde inte skapa pluggprojektet.")}`,
    );
  }

  if (createdStudySetIds.length === 1) {
    redirect(`/admin/prov/${createdStudySetIds[0]}`);
  }

  redirect(`/admin/prov?created_parts=${createdStudySetIds.length}`);
}

/**
 * Sektion 66: material får aldrig raderas vid AI-fel, och admin ska kunna
 * försöka igen. Körs om hela genereringen mot samma sparade materialtext.
 */
export async function regenerateQuestionsAction(studySetId: string, materialId: string) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: studySet } = await supabase
    .from("study_sets")
    .select("*, chapters(title, subjects(name))")
    .eq("id", studySetId)
    .eq("admin_id", profile.id)
    .maybeSingle();

  const { data: material } = await supabase
    .from("source_material")
    .select("*")
    .eq("id", materialId)
    .eq("study_set_id", studySetId)
    .maybeSingle();

  if (!studySet || !material || !material.extracted_text) {
    redirect(`/admin/prov/${studySetId}`);
  }

  await supabase
    .from("source_material")
    .update({ processing_status: "processing" })
    .eq("id", materialId);

  const chapterData = studySet as unknown as {
    chapters: { title: string; subjects: { name: string } | null } | null;
  };

  try {
    await generateAndSaveQuestions({
      studySetId,
      materialId,
      text: material.extracted_text,
      subjectName: chapterData.chapters?.subjects?.name ?? "",
      chapterTitle: chapterData.chapters?.title ?? "",
      gradeLevel: studySet.grade_level ?? 7,
    });
    await supabase
      .from("source_material")
      .update({ processing_status: "ready" })
      .eq("id", materialId);
  } catch (err) {
    console.error("AI-frågegenerering misslyckades (regenerateQuestionsAction):", err);
    await supabase
      .from("source_material")
      .update({ processing_status: "error" })
      .eq("id", materialId);
  }

  revalidatePath(`/admin/prov/${studySetId}`);
}

/**
 * Tar bort ett pluggprojekt helt — kaskad rensar automatiskt dess frågor,
 * källmaterial, tilldelningar och elevförsök (se FK-constraints). RLS
 * (study_sets_admin_all) säkerställer att bara ägande admin kan göra det.
 */
export async function deleteStudySetAction(studySetId: string) {
  await requireProfile("admin");
  const supabase = createClient();

  await supabase.from("study_sets").delete().eq("id", studySetId);

  revalidatePath("/admin/prov");
  redirect("/admin/prov");
}
