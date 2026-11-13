"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Föräldern sätter elevens provdatum och provområde för ett tilldelat
 * test (steg 0). RLS släpper bara igenom tilldelningar föräldern äger.
 */
export async function updateAssignmentExamAction(assignmentId: string, returnPath: string, formData: FormData) {
  await requireProfile("admin");
  const supabase = createClient();

  const rawDate = String(formData.get("examDate") ?? "").trim();
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  const areas = formData
    .getAll("examAreas")
    .map((a) => String(a).trim().slice(0, 120))
    .filter(Boolean);
  // Alla områden ikryssade = hela testet (lagras som null).
  const areaCount = Number(formData.get("areaCount") ?? 0);
  const wholeTest = !areas.length || areas.length >= areaCount;

  const { error } = await supabase
    .from("assignments")
    .update({ exam_date: examDate, exam_areas: wholeTest ? null : areas })
    .eq("id", assignmentId);
  if (error) console.error("Kunde inte spara provdatum:", error);

  revalidatePath(returnPath);
  revalidatePath("/elev");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Föräldern väljer på elevsidan vilka test som ska ligga öppna för eleven.
 * Avbockade tilldelningar tas bort (svaren och kunskapsstatusen finns kvar),
 * påbockade egna test tilldelas. Bara test som visades i formuläret ändras.
 */
export async function updateStudentAssignmentsAction(studentId: string, formData: FormData) {
  const profile = await requireProfile("admin");
  const supabase = createClient();
  if (!UUID_RE.test(studentId)) return;

  // Eleven måste vara förälderns egen.
  const { data: guardian } = await supabase
    .from("student_guardians")
    .select("student_id")
    .eq("admin_id", profile.id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!guardian) return;

  const shown = new Set(formData.getAll("shown").map(String).filter((id) => UUID_RE.test(id)));
  const checked = new Set(formData.getAll("setIds").map(String).filter((id) => shown.has(id)));

  const { data: existing } = await supabase
    .from("assignments")
    .select("id, study_set_id")
    .eq("student_id", studentId);
  const assignedSetIds = new Set((existing ?? []).map((a) => a.study_set_id as string));

  const removed = (existing ?? [])
    .filter((a) => shown.has(a.study_set_id) && !checked.has(a.study_set_id))
    .map((a) => a.id as string);
  if (removed.length) {
    const { error } = await supabase.from("assignments").delete().in("id", removed);
    if (error) console.error("Kunde inte ta bort tilldelning:", error);
  }

  const added = [...checked].filter((id) => !assignedSetIds.has(id));
  if (added.length) {
    // Bara förälderns egna, publicerade test kan läggas till härifrån.
    const { data: sets } = await supabase
      .from("study_sets")
      .select("id, exam_date")
      .in("id", added)
      .eq("admin_id", profile.id)
      .eq("status", "published");
    if (sets?.length) {
      const { error } = await supabase.from("assignments").insert(
        sets.map((s) => ({
          study_set_id: s.id,
          student_id: studentId,
          assigned_by: profile.id,
          exam_date: s.exam_date ?? null,
        })),
      );
      if (error) console.error("Kunde inte tilldela test:", error);
    }
  }

  revalidatePath(`/admin/elever/${studentId}`);
  revalidatePath("/elev");
}
