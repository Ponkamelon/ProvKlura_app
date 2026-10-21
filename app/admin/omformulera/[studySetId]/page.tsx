import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  activateRewordingAction,
  discardRewordingAction,
  dropVariantAction,
  generateRewordingAction,
  revertToOriginalAction,
  updateVariantAction,
} from "@/app/actions/rewording";
import { Icon } from "@/components/Icon";

// AI-omformuleringen körs i en Server Action från den här sidan.
export const maxDuration = 60;

type Rewording = {
  id: string;
  status: "generating" | "draft" | "active" | "archived" | "failed";
  round: number;
  error: string | null;
  created_at: string;
  activated_at: string | null;
};

type OriginalQuestion = {
  id: string;
  question: string;
  question_type: string;
  answer_options: string[] | null;
  correct_answer: string;
  explanation: string | null;
};

type Variant = {
  id: string;
  question_id: string;
  question: string;
  answer_options: string[] | null;
  correct_answer: string;
  explanation: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long" }) : "";

function Options({ options, correct, muted }: { options: string[]; correct: string; muted?: boolean }) {
  return (
    <ul className={`mt-2 space-y-1 text-sm ${muted ? "text-navy/50" : "text-navy/80"}`}>
      {options.map((o, i) => (
        <li key={i} className={o === correct ? `font-semibold ${muted ? "" : "text-ocean-dark"}` : ""}>
          {o === correct ? "✓ " : "· "}
          {o}
        </li>
      ))}
    </ul>
  );
}

function VariantCard({
  studySetId,
  original,
  variant,
  editable,
}: {
  studySetId: string;
  original: OriginalQuestion;
  variant: Variant | undefined;
  editable: boolean;
}) {
  const options = Array.isArray(original.answer_options) ? original.answer_options : null;
  const isMc = original.question_type === "multiple_choice" && !!options;

  return (
    <div className="notebook-card p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy/40">Original</p>
          <p className="mt-1 text-navy/60">{original.question}</p>
          {isMc ? (
            <Options options={options!} correct={original.correct_answer} muted />
          ) : (
            <p className="mt-1 text-sm text-navy/50">Svar: {original.correct_answer}</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Ny formulering</p>
          {variant ? (
            <>
              <p className="mt-1 font-medium text-navy">{variant.question}</p>
              {isMc && variant.answer_options ? (
                <Options options={variant.answer_options} correct={variant.correct_answer} />
              ) : (
                <p className="mt-1 text-sm text-ocean-dark">Svar: {variant.correct_answer}</p>
              )}
              {variant.explanation && <p className="mt-2 text-xs text-navy/50">{variant.explanation}</p>}
            </>
          ) : (
            <p className="mt-1 text-sm text-navy/50">Behåller sin gamla formulering.</p>
          )}
        </div>
      </div>

      {editable && variant && (
        <div className="mt-3 flex flex-wrap items-start gap-4 text-xs">
          <details className="flex-1">
            <summary className="cursor-pointer text-ocean underline">Ändra själv</summary>
            <form action={updateVariantAction.bind(null, studySetId, variant.id)} className="mt-3 space-y-2">
              <label className="field-label" htmlFor={`q-${variant.id}`}>
                Fråga
              </label>
              <textarea
                id={`q-${variant.id}`}
                name="question"
                defaultValue={variant.question}
                rows={2}
                maxLength={400}
                className="field-input py-2 text-sm"
              />
              {isMc &&
                variant.answer_options?.map((o, i) => (
                  <div key={i}>
                    <label className="field-label" htmlFor={`o-${variant.id}-${i}`}>
                      Alternativ {i + 1}
                      {options![i] === original.correct_answer ? " (rätt svar)" : ""}
                    </label>
                    <input
                      id={`o-${variant.id}-${i}`}
                      name={`option_${i}`}
                      defaultValue={o}
                      maxLength={200}
                      className="field-input py-2 text-sm"
                    />
                  </div>
                ))}
              <label className="field-label" htmlFor={`e-${variant.id}`}>
                Förklaring
              </label>
              <textarea
                id={`e-${variant.id}`}
                name="explanation"
                defaultValue={variant.explanation ?? ""}
                rows={2}
                maxLength={400}
                className="field-input py-2 text-sm"
              />
              <SubmitButton pendingText="Sparar…" className="btn-secondary px-4 py-2 text-sm">
                <Icon name="spara" size={18} />
                Spara
              </SubmitButton>
            </form>
          </details>
          <form action={dropVariantAction.bind(null, studySetId, variant.id)}>
            <button type="submit" className="link-back text-navy/70">
              <Icon name="dra-tillbaka" size={16} />
              Behåll originalet
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default async function RewordPage({
  params,
  searchParams,
}: {
  params: { studySetId: string };
  searchParams: { meddelande?: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: allowed } = await supabase.rpc("can_reword_study_set", { p_study_set_id: params.studySetId });
  const { data: studySet } = await supabase
    .from("study_sets")
    .select("id, title, is_official, admin_id, chapters(subject_id)")
    .eq("id", params.studySetId)
    .maybeSingle();

  if (allowed !== true || !studySet) {
    return <p className="text-navy/70">Hittade inte testet.</p>;
  }

  const subjectId = (studySet.chapters as unknown as { subject_id: string } | null)?.subject_id;
  const backHref = studySet.is_official
    ? `/admin/testbibliotek/${subjectId ?? ""}`
    : `/admin/prov/${studySet.id}`;

  const [{ data: questions }, { data: rewordings }, { data: assignments }] = await Promise.all([
    supabase
      .from("questions")
      .select("id, question, question_type, answer_options, correct_answer, explanation")
      .eq("study_set_id", studySet.id)
      .eq("status", "published")
      .order("created_at"),
    supabase
      .from("test_rewordings")
      .select("id, status, round, error, created_at, activated_at")
      .eq("study_set_id", studySet.id)
      .eq("admin_id", profile.id)
      .in("status", ["generating", "draft", "active", "failed"])
      .order("created_at", { ascending: false }),
    supabase
      .from("assignments")
      .select("student_id, profiles!assignments_student_id_fkey(display_name)")
      .eq("study_set_id", studySet.id)
      .eq("assigned_by", profile.id),
  ]);

  const all = (rewordings ?? []) as Rewording[];
  const active = all.find((r) => r.status === "active");
  const draft = all.find((r) => r.status === "draft");
  const failed = all.find((r) => r.status === "failed");
  const originals = (questions ?? []) as OriginalQuestion[];

  const shown = draft ?? active;
  const { data: variantRows } = shown
    ? await supabase
        .from("question_variants")
        .select("id, question_id, question, answer_options, correct_answer, explanation")
        .eq("rewording_id", shown.id)
    : { data: [] as Variant[] };
  const variants = new Map(((variantRows ?? []) as Variant[]).map((v) => [v.question_id, v]));

  const studentNames = (assignments ?? [])
    .map((a) => (a.profiles as unknown as { display_name: string } | null)?.display_name)
    .filter(Boolean) as string[];

  return (
    <div>
      <Link href={backHref} className="link-back">
        <Icon name="tillbaka" size={16} />
        Tillbaka
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Nya formuleringar</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
      <p className="mt-2 text-lg text-navy">{studySet.title}</p>

      <div className="mt-4 max-w-2xl space-y-2 text-navy/70">
        <p>
          När eleven har vant sig vid testet kan du låta frågorna och svaren formuleras om. Samma
          kunskap testas, men med andra ord, så eleven tränar på att känna igen frågan även när den
          låter annorlunda på provet. Inga nya frågor läggs till.
        </p>
        <p className="text-sm">
          Ordningen på frågorna och svarsalternativen blandas redan om automatiskt varje gång eleven
          gör testet. Elevens framsteg på varje fråga följer med till den nya formuleringen.
        </p>
        <p className="text-sm">
          {studentNames.length
            ? `Gäller för: ${studentNames.join(", ")}. Andra föräldrar påverkas inte.`
            : "Du har inte delat testet med någon elev än. Versionen gäller dina elever när du delar det."}
        </p>
      </div>

      {searchParams.meddelande && (
        <p className="mt-4 rounded-xl bg-white p-4 text-navy" role="status">
          {searchParams.meddelande}
        </p>
      )}

      <section className="notebook-card mt-6 p-5">
        <p className="text-sm text-navy/60">Det här ser eleven nu</p>
        <p className="mt-1 text-lg font-semibold text-navy">
          {active
            ? `Omformulerad version ${active.round}, aktiverad ${fmt(active.activated_at)}`
            : "Originalformuleringarna"}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!draft && (
            <form action={generateRewordingAction.bind(null, studySet.id)}>
              <SubmitButton pendingText="Formulerar om… (upp till en minut)" className="btn-primary">
                <Icon name="formulera-om" />
                {active ? "Formulera om igen" : "Formulera om testet"}
              </SubmitButton>
            </form>
          )}
          {active && (
            <form action={revertToOriginalAction.bind(null, studySet.id)}>
              <ConfirmSubmitButton
                message="Gå tillbaka till originalformuleringarna?"
                className="btn-secondary"
              >
                Återgå till originalet
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
        {failed && !draft && (
          <p className="mt-3 text-sm text-coral-dark">Senaste försöket gick inte: {failed.error}</p>
        )}
      </section>

      {draft && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-navy">Granska innan eleven ser det</h2>
              <p className="text-sm text-navy/60">
                {variants.size} av {originals.length} frågor har ny formulering. Rätt svar är markerat med ✓.
              </p>
            </div>
            <div className="flex gap-2">
              <form action={discardRewordingAction.bind(null, studySet.id, draft.id)}>
                <ConfirmSubmitButton message="Släng utkastet?" className="btn-secondary px-4 py-2 text-sm">
                  Släng
                </ConfirmSubmitButton>
              </form>
              <form action={activateRewordingAction.bind(null, studySet.id, draft.id)}>
                <SubmitButton pendingText="Aktiverar…" className="btn-primary px-4 py-2 text-sm">
                  Aktivera för eleven
                </SubmitButton>
              </form>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {originals.map((q) => (
              <VariantCard key={q.id} studySetId={studySet.id} original={q} variant={variants.get(q.id)} editable />
            ))}
          </div>
        </section>
      )}

      {!draft && active && (
        <details className="mt-8">
          <summary className="cursor-pointer font-display text-xl font-semibold text-navy">
            Visa den aktiva versionen ({variants.size} omformulerade frågor)
          </summary>
          <div className="mt-4 space-y-3">
            {originals.map((q) => (
              <VariantCard
                key={q.id}
                studySetId={studySet.id}
                original={q}
                variant={variants.get(q.id)}
                editable={false}
              />
            ))}
          </div>
        </details>
      )}
      <div className="h-24" aria-hidden="true" />
    </div>
  );
}
