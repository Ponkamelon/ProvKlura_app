import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WritingRunner } from "@/components/WritingRunner";
import { isTimeLevel, parseWritingContent } from "@/lib/writing/types";

// AI-feedbacken hämtas via en Server Action från den här sidan. Vercel
// Hobby tillåter upp till 60 s — svaret brukar komma på några sekunder.
export const maxDuration = 60;

export default async function SkrivkluraOvaPage({
  params,
  searchParams,
}: {
  params: { studySetId: string };
  searchParams: { niva?: string; hoppa?: string };
}) {
  await requireProfile("student");
  const supabase = createClient();

  const { data: studySet } = await supabase
    .from("study_sets")
    .select("id, title, writing_content")
    .eq("id", params.studySetId)
    .eq("set_type", "skriv")
    .eq("status", "published")
    .maybeSingle();

  const content = studySet ? parseWritingContent(studySet.writing_content) : null;

  if (!studySet || !content) {
    redirect("/elev/skrivklura");
  }

  const level = isTimeLevel(searchParams.niva) ? searchParams.niva : "snabb";
  const skipLearn = searchParams.hoppa === "1" && level !== "snabb";

  return (
    <WritingRunner
      // Ny nyckel = ny omgång, så att "Jag orkar skriva lite också"
      // (snabb → normal) börjar om från första skrivskärmen.
      key={`${level}-${skipLearn ? "skriv" : "allt"}`}
      studySetId={studySet.id}
      title={studySet.title}
      content={content}
      level={level}
      skipLearn={skipLearn}
    />
  );
}
