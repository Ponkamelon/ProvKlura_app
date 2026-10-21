import Link from "next/link";
import { updateQuestionAction } from "@/app/actions/questions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/Icon";

export default async function EditQuestionPage({
  params,
}: {
  params: { studySetId: string; questionId: string };
}) {
  const profile = await requireProfile("admin");
  const supabase = createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("*, study_sets!inner(admin_id)")
    .eq("id", params.questionId)
    .eq("study_sets.admin_id", profile.id)
    .maybeSingle();

  if (!question) {
    return <p className="text-navy/70">Hittade inte frågan.</p>;
  }

  const options = Array.isArray(question.answer_options)
    ? (question.answer_options as string[])
    : ["", "", "", ""];

  const boundAction = updateQuestionAction.bind(
    null,
    params.studySetId,
    params.questionId,
  );

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href={`/admin/prov/${params.studySetId}`}
        className="link-back"
      >
        <Icon name="tillbaka" size={16} />
        Tillbaka
      </Link>
      <h1 className="mt-2 font-display text-2xl font-semibold text-navy">
        Redigera fråga
      </h1>

      <form action={boundAction} className="notebook-card mt-6 space-y-4 p-6">
        <input type="hidden" name="questionType" value={question.question_type} />

        <div>
          <label htmlFor="question" className="field-label">
            Fråga
          </label>
          <textarea
            id="question"
            name="question"
            defaultValue={question.question}
            required
            rows={2}
            className="field-input"
          />
        </div>

        {question.question_type === "multiple_choice" && (
          <div className="space-y-2">
            <p className="field-label">Alternativ</p>
            {[0, 1, 2, 3].map((i) => (
              <input
                key={i}
                name={`option${i}`}
                defaultValue={options[i] ?? ""}
                className="field-input"
                placeholder={`Alternativ ${i + 1}`}
              />
            ))}
          </div>
        )}

        <div>
          <label htmlFor="correctAnswer" className="field-label">
            Rätt svar
          </label>
          <input
            id="correctAnswer"
            name="correctAnswer"
            defaultValue={question.correct_answer}
            required
            className="field-input"
          />
          {question.question_type === "multiple_choice" && (
            <p className="mt-1 text-xs text-navy/50">
              Måste vara identisk med ett av alternativen ovan.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="explanation" className="field-label">
            Förklaring
          </label>
          <textarea
            id="explanation"
            name="explanation"
            defaultValue={question.explanation ?? ""}
            rows={2}
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor="imageUrl" className="field-label">
            Bild-URL (valfritt)
          </label>
          {question.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.image_url}
              alt=""
              className="mb-2 max-h-40 w-auto rounded-xl border border-sand-deep bg-white object-contain"
            />
          )}
          <input
            id="imageUrl"
            name="imageUrl"
            type="url"
            defaultValue={question.image_url ?? ""}
            className="field-input"
            placeholder="https://..."
          />
          <p className="mt-1 text-xs text-navy/50">
            Visas ovanför frågan för eleven. Lämna tomt för ingen bild.
          </p>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1">
            <Icon name="spara" />
            Spara
          </button>
          <Link
            href={`/admin/prov/${params.studySetId}`}
            className="btn-secondary flex-1 text-center"
          >
            <Icon name="avbryt" />
            Avbryt
          </Link>
        </div>
      </form>
    </div>
  );
}
