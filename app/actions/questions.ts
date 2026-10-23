"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function assertOwnsStudySet(studySetId: string) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: studySet } = await supabase
    .from("study_sets")
    .select("id, admin_id")
    .eq("id", studySetId)
    .maybeSingle();

  if (!studySet || studySet.admin_id !== profile.id) {
    redirect("/admin/prov");
  }

  return { profile, supabase };
}

export async function publishQuestionAction(studySetId: string, questionId: string) {
  const { supabase } = await assertOwnsStudySet(studySetId);
  await supabase.from("questions").update({ status: "published" }).eq("id", questionId);
  revalidatePath(`/admin/prov/${studySetId}`);
}

export async function unpublishQuestionAction(studySetId: string, questionId: string) {
  const { supabase } = await assertOwnsStudySet(studySetId);
  await supabase.from("questions").update({ status: "draft" }).eq("id", questionId);
  revalidatePath(`/admin/prov/${studySetId}`);
}

export async function deleteQuestionAction(studySetId: string, questionId: string) {
  const { supabase } = await assertOwnsStudySet(studySetId);
  await supabase.from("questions").delete().eq("id", questionId);
  revalidatePath(`/admin/prov/${studySetId}`);
}

/** Sektion 38: "Godkänna alla" — publicerar de frågor AI:n redan bedömt med hög säkerhet. */
export async function publishAllReviewedAction(studySetId: string) {
  const { supabase } = await assertOwnsStudySet(studySetId);

  await supabase
    .from("questions")
    .update({ status: "published" })
    .eq("study_set_id", studySetId)
    .eq("verification_status", "verified");

  await supabase.from("study_sets").update({ status: "published" }).eq("id", studySetId);

  revalidatePath(`/admin/prov/${studySetId}`);
}

export async function updateQuestionAction(
  studySetId: string,
  questionId: string,
  formData: FormData,
) {
  const { supabase } = await assertOwnsStudySet(studySetId);

  const question = String(formData.get("question") ?? "").trim();
  const correctAnswer = String(formData.get("correctAnswer") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim();
  const questionType = String(formData.get("questionType") ?? "");
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();

  const options = [
    formData.get("option0"),
    formData.get("option1"),
    formData.get("option2"),
    formData.get("option3"),
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  // Ny frågeversion när föräldern ändrar innehållet (steg 0). Kunskapspunkten
  // är densamma, så elevens historik på punkten fortsätter räknas.
  const { data: before } = await supabase
    .from("questions")
    .select("question, correct_answer, answer_options, version")
    .eq("id", questionId)
    .maybeSingle();
  const newOptions = questionType === "multiple_choice" ? options : null;
  const contentChanged =
    !!before &&
    (before.question !== question ||
      before.correct_answer !== correctAnswer ||
      JSON.stringify(before.answer_options ?? null) !== JSON.stringify(newOptions));

  await supabase
    .from("questions")
    .update({
      ...(contentChanged ? { version: (before?.version ?? 1) + 1 } : {}),
      question,
      correct_answer: correctAnswer,
      explanation,
      answer_options: newOptions,
      image_url: imageUrl || null,
      // En admin som manuellt redigerar en fråga har i praktiken granskat den.
      verification_status: "verified",
    })
    .eq("id", questionId);

  revalidatePath(`/admin/prov/${studySetId}`);
  redirect(`/admin/prov/${studySetId}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sektion 39: tilldela ett pluggprojekt till valda elever. Befintliga
 * tilldelningar behålls (med sina provdatum); bara av- och påkryssade
 * elever ändras. Nya tilldelningar får setets provdatum som förval.
 */
export async function assignStudySetAction(studySetId: string, formData: FormData) {
  const { profile, supabase } = await assertOwnsStudySet(studySetId);
  const studentIds = new Set(formData.getAll("studentIds").map(String).filter((id) => UUID_RE.test(id)));

  const [{ data: existing }, { data: studySet }] = await Promise.all([
    supabase.from("assignments").select("id, student_id").eq("study_set_id", studySetId),
    supabase.from("study_sets").select("exam_date").eq("id", studySetId).maybeSingle(),
  ]);
  const existingIds = new Set((existing ?? []).map((a) => a.student_id));

  const removed = (existing ?? []).filter((a) => !studentIds.has(a.student_id)).map((a) => a.id);
  if (removed.length) await supabase.from("assignments").delete().in("id", removed);

  const added = [...studentIds].filter((id) => !existingIds.has(id));
  if (added.length) {
    await supabase.from("assignments").insert(
      added.map((studentId) => ({
        study_set_id: studySetId,
        student_id: studentId,
        assigned_by: profile.id,
        exam_date: studySet?.exam_date ?? null,
      })),
    );
  }

  revalidatePath(`/admin/prov/${studySetId}`);
  revalidatePath("/elev");
}
