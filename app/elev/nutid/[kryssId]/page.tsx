import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NutidKryss } from "@/components/NutidKryss";
import { NUTID_COLUMNS } from "@/lib/nutid/current";
import { isUsableKryss, toStudentEntries, type NutidKryssRow } from "@/lib/nutid/types";
import { isoWeekNumber } from "@/lib/nutid/week";

export default async function NutidKryssPage({ params }: { params: { kryssId: string } }) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const [{ data }, { data: attempt }] = await Promise.all([
    supabase.from("nutidskryss").select(NUTID_COLUMNS).eq("id", params.kryssId).eq("status", "published").maybeSingle(),
    supabase
      .from("nutidskryss_attempts")
      .select("solved")
      .eq("student_id", profile.id)
      .eq("kryss_id", params.kryssId)
      .maybeSingle(),
  ]);

  const kryss = data as NutidKryssRow | null;
  if (!kryss || !isUsableKryss(kryss)) redirect("/elev/nutid");

  const solved = Array.isArray(attempt?.solved) ? (attempt.solved as string[]) : [];
  const title =
    kryss.is_evergreen || !kryss.week_start ? kryss.title : `Veckans nyheter · vecka ${isoWeekNumber(kryss.week_start)}`;

  return (
    <NutidKryss
      kryssId={kryss.id}
      title={title}
      entries={toStudentEntries(kryss.entries)}
      layout={kryss.layout!}
      initialSolved={solved}
      isNews={!kryss.is_evergreen}
    />
  );
}
