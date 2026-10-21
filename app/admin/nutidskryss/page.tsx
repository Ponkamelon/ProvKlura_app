import { WaveDivider } from "@/components/WaveDivider";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NUTID_COLUMNS } from "@/lib/nutid/current";
import { MIN_QUESTIONS, SIGNS, isUsableKryss, type NutidKryssRow } from "@/lib/nutid/types";
import { currentWeekStart, isoWeekNumber } from "@/lib/nutid/week";
import {
  publishNutidAction,
  rejectNutidAction,
  removeNutidQuestionAction,
  requestNutidDraftAction,
  updateNutidQuestionAction,
} from "@/app/actions/nutid";

function weekLabel(k: NutidKryssRow) {
  return k.week_start ? `Vecka ${isoWeekNumber(k.week_start)}` : "Utan vecka";
}

function DraftCard({ kryss }: { kryss: NutidKryssRow }) {
  const canRemove = kryss.entries.length > MIN_QUESTIONS;
  return (
    <article className="nutid-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nutid-badge">{weekLabel(kryss)} · utkast</p>
          <h3 className="mt-2 text-lg font-semibold text-navy">
            {kryss.title} · {kryss.entries.length} frågor
          </h3>
          <p className="text-xs text-navy/50">
            Skapat {new Date(kryss.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={rejectNutidAction.bind(null, kryss.id)}>
            <ConfirmSubmitButton message="Avvisa hela utkastet?" className="btn-secondary px-4 py-2 text-sm">
              Avvisa
            </ConfirmSubmitButton>
          </form>
          <form action={publishNutidAction.bind(null, kryss.id)}>
            <SubmitButton pendingText="Publicerar…" className="btn-primary px-4 py-2 text-sm">
              Publicera
            </SubmitButton>
          </form>
        </div>
      </div>

      <ol className="mt-5 space-y-4">
        {kryss.entries.map((q, index) => (
          <li key={index} className="rounded-xl bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium text-navy">
                {index + 1}. {q.question}
              </p>
              <span className="text-xs text-navy/50">{q.subject}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {q.options.map((o, i) => (
                <li key={i} className={i === q.correct ? "font-semibold text-ocean-dark" : "text-navy/70"}>
                  <span className="mr-2 font-mono">{SIGNS[i]}</span>
                  {o}
                  {i === q.correct ? " ✓" : ""}
                </li>
              ))}
            </ul>
            {q.explanation && <p className="mt-2 text-xs text-navy/60">{q.explanation}</p>}

            {q.sources.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-navy/60">
                {q.sources.map((s) => (
                  <li key={`${s.source}-${s.url}`}>
                    <span className="font-semibold">{s.source}:</span>{" "}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-start gap-4 text-xs">
              <details className="flex-1">
                <summary className="cursor-pointer text-ocean underline">Ändra</summary>
                <form action={updateNutidQuestionAction.bind(null, kryss.id, index)} className="mt-3 space-y-2">
                  <label className="field-label" htmlFor={`q-${kryss.id}-${index}`}>
                    Fråga
                  </label>
                  <textarea
                    id={`q-${kryss.id}-${index}`}
                    name="question"
                    defaultValue={q.question}
                    rows={2}
                    maxLength={300}
                    className="field-input py-2 text-sm"
                  />
                  {q.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-sm text-navy" title="Rätt svar">
                        <input type="radio" name="correct" value={i} defaultChecked={i === q.correct} />
                        <span className="w-4 font-mono">{SIGNS[i]}</span>
                      </label>
                      <input
                        aria-label={`Alternativ ${SIGNS[i]}`}
                        name={`option_${i}`}
                        defaultValue={o}
                        maxLength={150}
                        className="field-input flex-1 py-2 text-sm"
                      />
                    </div>
                  ))}
                  <p className="text-navy/50">Markera rätt svar med rundknappen.</p>
                  <label className="field-label" htmlFor={`e-${kryss.id}-${index}`}>
                    Förklaring (visas efter svaret)
                  </label>
                  <textarea
                    id={`e-${kryss.id}-${index}`}
                    name="explanation"
                    defaultValue={q.explanation}
                    rows={2}
                    maxLength={300}
                    className="field-input py-2 text-sm"
                  />
                  <SubmitButton pendingText="Sparar…" className="btn-secondary px-4 py-2 text-sm">
                    Spara
                  </SubmitButton>
                </form>
              </details>
              {canRemove && (
                <form action={removeNutidQuestionAction.bind(null, kryss.id, index)}>
                  <ConfirmSubmitButton
                    message={`Ta bort fråga ${index + 1}?`}
                    className="text-navy/50 underline hover:text-coral-dark"
                  >
                    Ta bort frågan
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default async function NutidskryssAdminPage({
  searchParams,
}: {
  searchParams: { meddelande?: string };
}) {
  await requireProfile("admin");
  const supabase = createClient();

  const { data: isEditor } = await supabase.rpc("is_content_editor");
  if (isEditor !== true) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold text-navy">Nutidskrysset</h1>
        <p className="mt-4 text-navy/70">
          Veckans nutidskryss granskas av ProvKluras redaktion och visas automatiskt för alla elever.
        </p>
      </div>
    );
  }

  const { data } = await supabase
    .from("nutidskryss")
    .select(NUTID_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(40);
  const all = (data ?? []) as NutidKryssRow[];

  const drafts = all.filter((k) => k.status === "draft" && isUsableKryss(k));
  const failed = all.filter((k) => k.status === "failed").slice(0, 3);
  const published = all.filter((k) => k.status === "published" && !k.is_evergreen).slice(0, 6);
  const evergreen = all.filter((k) => k.is_evergreen && k.status === "published");
  const thisWeek = currentWeekStart();
  const publishedThisWeek = published.some((k) => k.week_start === thisWeek);

  return (
    <div data-nutid>
      <h1 className="font-display text-3xl font-semibold text-navy">Nutidskrysset</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#B4235A" />
      <p className="mt-4 max-w-2xl text-navy/70">
        Varje måndag morgon skapas tio 1 X 2-frågor från SVT, Sveriges Radio, DN, SvD, Aftonbladet
        och Expressen. Bara nyheter som finns hos minst två av dem används, och tunga ämnen som
        krig, våld och brott sorteras bort. Inget syns för eleverna förrän du publicerar. Utan
        publicerat kryss får eleverna ett av reservkryssen.
      </p>

      {searchParams.meddelande && (
        <p className="mt-4 rounded-xl bg-white p-4 text-navy" role="status">
          {searchParams.meddelande}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <form action={requestNutidDraftAction}>
          <SubmitButton pendingText="Startar…" className="btn-secondary">
            Skapa nytt utkast nu
          </SubmitButton>
        </form>
        <span className="text-sm text-navy/60">
          {publishedThisWeek
            ? `Vecka ${isoWeekNumber(thisWeek)} är publicerad.`
            : `Vecka ${isoWeekNumber(thisWeek)}: eleverna ser just nu ett reservkryss.`}
        </span>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-navy">Väntar på granskning</h2>
        <div className="mt-4 space-y-6">
          {drafts.length ? (
            drafts.map((k) => <DraftCard key={k.id} kryss={k} />)
          ) : (
            <p className="text-navy/60">Inga utkast just nu.</p>
          )}
        </div>
      </section>

      {failed.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-navy">Senaste försök som inte gick</h2>
          <ul className="mt-3 space-y-2">
            {failed.map((k) => (
              <li key={k.id} className="rounded-xl bg-white/80 p-3 text-sm text-navy/80">
                <span className="font-semibold">
                  {weekLabel(k)} · {new Date(k.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}:
                </span>{" "}
                {k.error}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-navy">Publicerade</h2>
        {published.length ? (
          <ul className="mt-3 space-y-2">
            {published.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 p-3">
                <span className="font-medium text-navy">
                  {weekLabel(k)} · {k.entries.length} frågor
                </span>
                <form action={rejectNutidAction.bind(null, k.id)}>
                  <ConfirmSubmitButton
                    message="Avpublicera krysset? Eleverna får ett reservkryss istället."
                    className="text-xs text-navy/50 underline"
                  >
                    Avpublicera
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-navy/60">Inget publicerat än.</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-navy">Reservkryss</h2>
        <p className="mt-1 text-sm text-navy/60">Visas de veckor inget nyhetskryss är publicerat. Byts varje vecka.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {evergreen.map((k) => (
            <li key={k.id} className="nutid-badge">
              {k.title} · {k.entries.length} frågor
            </li>
          ))}
        </ul>
      </section>
      <div className="h-24" aria-hidden="true" />
    </div>
  );
}
