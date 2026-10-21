import Anthropic from "@anthropic-ai/sdk";

// Samma klientinställning som i generateQuestions.ts.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

export type OriginalQuestion = {
  id: string;
  question: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "concept";
  answer_options: string[] | null;
  correct_answer: string;
  accepted_answers: string[] | null;
  explanation: string | null;
  /** Tidigare omformulering — AI:n ska undvika att upprepa den. */
  previous?: string | null;
};

export type RewordedQuestion = {
  question_id: string;
  question: string;
  answer_options: string[] | null;
  correct_answer: string;
  accepted_answers: string[] | null;
  explanation: string | null;
};

const SYSTEM_PROMPT = `Du formulerar om övningsfrågor i ProvKlura, en studieapp för elever i årskurs 7–9. Eleven har redan övat på frågorna och vant sig vid formuleringarna. Nu ska samma kunskap testas med andra ord, så att eleven är förberedd på hur frågan kan låta på det riktiga provet.

Regler:
- Testa EXAKT samma kunskap som originalet. Lägg inte till eller ta bort fakta. Gör inte frågan svårare eller lättare.
- Formulera om frågan med andra ord, gärna en annan vinkel: "Vad kallas…" kan bli "Vilket begrepp beskriver…", "Varför…" kan bli "Vad är orsaken till att…". Byt inte bara ett ord.
- Enkel svenska (eller engelska om originalet är på engelska). Max ca 25 ord.
- Flervalsfrågor: formulera om VARJE svarsalternativ med andra ord men samma innebörd. Behåll ordningen och antalet alternativ exakt — alternativ nummer 1 i ditt svar ska betyda samma sak som alternativ nummer 1 i originalet. Det rätta alternativet ska fortfarande vara det enda rätta. Facktermer som är själva svaret (t.ex. "fotosyntes", "inflation") får stå kvar.
- Tal, formler, uttryck och enstaka ord som eleven ska välja (t.ex. "−8", "10 × 10", "x = 5", "is") skrivs EXAKT som i originalet — skriv aldrig om dem med bokstäver eller andra tecken.
- Lucktexter och grammatikuppgifter: du får byta exempelmeningen, men bara om exakt samma svar fortfarande är det enda rätta.
- Sant/falskt: påståendet ska ha SAMMA sanningsvärde som originalet. Vänd aldrig ett sant påstående till falskt eller tvärtom.
- Kortsvar och begrepp: formulera bara om frågan. Det förväntade svaret ändras inte.
- Formulera om förklaringen kort (max ca 30 ord).
- Om en tidigare omformulering finns: gör en tredje, annorlunda variant — upprepa inte vare sig originalet eller den tidigare.

Svara ENDAST med en giltig JSON-array utan markdown, ett objekt per fråga i samma ordning:
[{"id": "<frågans id>", "fraga": "...", "alternativ": ["...", "..."], "forklaring": "..."}]
"alternativ" bara för flervalsfrågor.`;

function describe(q: OriginalQuestion): string {
  const lines = [`id: ${q.id}`, `typ: ${q.question_type}`, `fråga: ${q.question}`];
  if (q.question_type === "multiple_choice" && q.answer_options) {
    q.answer_options.forEach((o, i) => lines.push(`alternativ ${i + 1}${o === q.correct_answer ? " (RÄTT)" : ""}: ${o}`));
  } else {
    lines.push(`rätt svar: ${q.correct_answer}`);
  }
  if (q.explanation) lines.push(`förklaring: ${q.explanation}`);
  if (q.previous) lines.push(`tidigare omformulering (undvik): ${q.previous}`);
  return lines.join("\n");
}

function parseArray(raw: string): unknown[] {
  const first = raw.indexOf("[");
  const last = raw.lastIndexOf("]");
  if (first === -1 || last <= first) throw new Error("AI-svaret innehöll ingen lista");
  const candidate = raw.slice(first, last + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Avklippt svar: rädda de kompletta objekten.
    const cut = candidate.lastIndexOf("},");
    if (cut === -1) throw new Error("Kunde inte tolka AI-svaret");
    return JSON.parse(candidate.slice(0, cut + 1) + "]");
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Kontrollerar att omformuleringen fortfarande går att rätta på samma sätt
 * som originalet. Allt som inte klarar kontrollen kastas — då behåller den
 * frågan sin ursprungliga formulering.
 */
export function validateRewording(original: OriginalQuestion, item: Record<string, unknown>): RewordedQuestion | null {
  const question = clean(item.fraga, 400);
  if (question.length < 5) return null;
  if (question.toLowerCase() === original.question.trim().toLowerCase()) return null;
  const explanation = clean(item.forklaring, 400) || original.explanation;

  if (original.question_type === "multiple_choice") {
    const opts = original.answer_options ?? [];
    const correctIndex = opts.indexOf(original.correct_answer);
    const next = Array.isArray(item.alternativ) ? item.alternativ.map((o) => clean(o, 200)) : [];
    if (correctIndex === -1 || next.length !== opts.length || next.some((o) => !o)) return null;
    if (new Set(next.map((o) => o.toLowerCase())).size !== next.length) return null;
    return {
      question_id: original.id,
      question,
      answer_options: next,
      correct_answer: next[correctIndex],
      accepted_answers: null,
      explanation,
    };
  }

  // Sant/falskt, kortsvar och begrepp: svaret och godkända svar ligger kvar.
  return {
    question_id: original.id,
    question,
    answer_options: original.answer_options,
    correct_answer: original.correct_answer,
    accepted_answers: original.accepted_answers,
    explanation,
  };
}

async function rewordBatch(batch: OriginalQuestion[]): Promise<RewordedQuestion[]> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Formulera om de här ${batch.length} frågorna:\n\n${batch.map(describe).join("\n\n")}`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("AI:n gav inget textsvar");

  const byId = new Map(batch.map((q) => [q.id, q]));
  const result: RewordedQuestion[] = [];
  for (const raw of parseArray(textBlock.text)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const original = byId.get(String(item.id));
    if (!original) continue;
    const ok = validateRewording(original, item);
    if (ok) result.push(ok);
  }
  return result;
}

const BATCH_SIZE = 14;

/**
 * Formulerar om alla frågor. Omgångarna körs parallellt så att även ett
 * sluttest på 50–80 frågor hinner klart inom Vercels 60 sekunder.
 * En omgång som misslyckas gör bara att de frågorna behåller originalet.
 */
export async function rewordQuestions(questions: OriginalQuestion[]): Promise<{
  reworded: RewordedQuestion[];
  failedBatches: number;
}> {
  const batches: OriginalQuestion[][] = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) batches.push(questions.slice(i, i + BATCH_SIZE));

  const settled = await Promise.allSettled(batches.map(rewordBatch));
  const reworded: RewordedQuestion[] = [];
  let failedBatches = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") reworded.push(...s.value);
    else {
      failedBatches++;
      console.error("Omformulering misslyckades för en omgång:", s.reason);
    }
  }
  return { reworded, failedBatches };
}
