import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NutidQuiz } from "@/components/NutidQuiz";
import { NUTID_COLUMNS } from "@/lib/nutid/current";
import { isUsableKryss, toStudentQuestions, type NutidKryssRow } from "@/lib/nutid/types";
import { isoWeekNumber } from "@/lib/nutid/week";

export default async function NutidKryssPage({ params }: { params: { kryssId: string } }) {
  const profile = await requireProfile("student");
  const supabase = createClient();

  const [{ data }, { data: attempt }] = await Promise.all([
    supabase.from("nutidskryss").select(NUTID_COLUMNS).eq("id", params.kryssId).eq("status", "published").maybeSingle(),
    supabase
      .from("nutidskryss_attempts")
      .select("answers")
      .eq("student_id", profile.id)
      .eq("kryss_id", params.kryssId)
      .maybeSingle(),
  ]);

  const kryss = data as NutidKryssRow | null;
  if (!kryss || !isUsableKryss(kryss)) redirect("/elev/nutid");

  const answers = Array.isArray(attempt?.answers) ? (attempt.answers as (number | null)[]) : [];
  const title =
    kryss.is_evergreen || !kryss.week_start ? kryss.title : `Vecka ${isoWeekNumber(kryss.week_start)}`;

  return (
    <NutidQuiz
      kryssId={kryss.id}
      title={title}
      questions={toStudentQuestions(kryss.entries)}
      initialAnswers={answers}
      isNews={!kryss.is_evergreen}
    />
  );
}
