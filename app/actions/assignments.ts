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
