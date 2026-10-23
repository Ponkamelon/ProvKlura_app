"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/events/log";

/** Eleven väljer eller ändrar sitt veckomål (antal dagar med klart test). */
export async function setWeeklyGoalAction(formData: FormData) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const target = Math.round(Number(formData.get("target")));
  if (!Number.isFinite(target) || target < 1 || target > 7) return;

  const { error } = await supabase.from("weekly_goals").insert({ student_id: profile.id, target_days: target });
  if (error) {
    console.error("Kunde inte spara veckomål:", error);
    return;
  }
  await logEvent(supabase, "goal_updated", { props: { target_days: target } });
  revalidatePath("/elev");
}
