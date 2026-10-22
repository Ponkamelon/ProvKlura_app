"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RenewalRequestResult =
  | { status: "sent" | "already"; names: string[] }
  | { status: "not_eligible" | "no_recipient" | "not_allowed" | "error" };

/**
 * Eleven har fått alla rätt och ber föräldern förnya testet. Databasen
 * kontrollerar själv att ett försök med alla rätt finns.
 */
export async function requestRenewalAction(studySetId: string): Promise<RenewalRequestResult> {
  await requireProfile("student");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("request_test_renewal", { p_study_set_id: studySetId });
  if (error || !data) {
    console.error("Kunde inte skicka önskemål om förnyelse:", error);
    return { status: "error" };
  }
  revalidatePath(`/elev/plugga/${studySetId}`);
  const result = data as { status: string; names?: string[] };
  if (result.status === "sent" || result.status === "already") {
    return { status: result.status, names: Array.isArray(result.names) ? result.names : [] };
  }
  if (result.status === "not_eligible" || result.status === "no_recipient" || result.status === "not_allowed") {
    return { status: result.status };
  }
  return { status: "error" };
}

/** Föräldern väljer "Inte nu". Eleven kan be igen efter nästa test med alla rätt. */
export async function dismissRenewalAction(studySetId: string, returnPath: string) {
  const profile = await requireProfile("admin");
  const supabase = createClient();
  await supabase
    .from("renewal_requests")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("admin_id", profile.id)
    .eq("study_set_id", studySetId)
    .eq("status", "open");
  revalidatePath("/admin", "layout");
  revalidatePath(returnPath);
}
