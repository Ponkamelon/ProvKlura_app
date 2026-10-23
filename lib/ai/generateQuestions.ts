import Anthropic from "@anthropic-ai/sdk";

// Reservlösning: om ANTHROPIC_API_KEY är en identitetskopplad nyckel som
// spänner över flera workspaces krävs en anthropic-workspace-id-header på
// varje anrop. Sätt ANTHROPIC_WORKSPACE_ID i miljövariablerna om ni ser
// felet "anthropic-workspace-id is required..." och inte kan skapa om
// nyckeln som workspace-specifik istället.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

export type GeneratedQuestion = {
  question: string;
  type: "multiple_choice" | "true_false" | "short_answer" | "concept";
  options?: string[];
  correct_answer: string;
  accepted_answers?: string[];
  explanation: string;
  knowledge_unit: string;
  /** Vald kunskapspunkt ur listan, "Område › Punkt" — tom om ingen passar. */
  knowledge_point?: string;
  importance: "high" | "medium" | "low";
  confidence_score: number;
};

const SYSTEM_PROMPT = `Du genererar övningsfrågor för ProvKlura, en studieapp för elever i årskurs 7–9.

Grundregler:
- Använd ENDAST fakta som finns i det bifogade materialet. Hitta aldrig på information som inte står där.
- Varje fråga ska testa en sak i taget, vara kort och tydlig, undvika trickfrågor, tvetydighet och onödiga negationer.
- Anpassa svårighetsgrad efter årskurs: åk 7 = grundläggande fakta och begrepp; åk 8 = lägg även till orsaker, konsekvenser, jämförelser; åk 9 = mer komplexa samband, tillämpning, resonemang.
- Fråga: max ca 20–25 ord. Förklaring: max ca 25–30 ord.
- Frågetypsfördelning ungefär: 60% multiple_choice, 15% true_false, 15% short_answer, 10% concept.
- Flervalsfrågor (multiple_choice): exakt 4 alternativ i "options", ett rätt och tre trovärdiga fel, ungefär lika långa. "correct_answer" måste vara IDENTISK, tecken för tecken, med ett av alternativen i "options".
- Sant/falskt-frågor (true_false): "correct_answer" ska vara exakt "Sant" eller "Falskt".
- Kortsvarsfrågor (short_answer): ge gärna alternativa godkända svar i "accepted_answers".
- Ge varje fråga en "knowledge_unit" (vad eleven behöver kunna, kort fras) och en "knowledge_point": välj den punkt i listan "Kunskapspunkter" som frågan testar och skriv den exakt som den står ("Område › Punkt"). Passar ingen punkt, eller saknas listan, skriv tom sträng "". Ge också "importance" ("high"/"medium"/"low" — sikta på ungefär 60% high, 30% medium, 10% low över hela frågebanken).
- "confidence_score": ett tal 0–1 som visar hur säker du är på att svaret verkligen stöds av materialet. Var ärlig — sätt lågt värde om materialet är otydligt.
- Hellre färre bra frågor än många repetitiva. Riktvärde: normalt material 12–18 frågor, litet material 8–12. Skapa ALDRIG fler än 20 frågor totalt, oavsett hur stort materialet är — hellre välj ut det viktigaste än att svaret blir avklippt. Skapa inte dubbletter som testar exakt samma sak med olika ord.

Svara ENDAST med en giltig JSON-array, inget annat — ingen inledande text, ingen markdown-kodruta. Varje objekt ska ha exakt fälten: question, type, options (endast för multiple_choice), correct_answer, accepted_answers (valfritt), explanation, knowledge_unit, knowledge_point, importance, confidence_score.`;

export async function generateQuestionsFromText(params: {
  text: string;
  subjectName: string;
  chapterTitle: string;
  gradeLevel: number;
  /** Kunskapspunkter att välja bland, som "Område › Punkt". */
  knowledgePoints?: string[];
}): Promise<GeneratedQuestion[]> {
  const { text, subjectName, chapterTitle, gradeLevel } = params;
  const pointList = params.knowledgePoints?.length
    ? `\n\nKunskapspunkter (välj en per fråga om någon passar):\n${params.knowledgePoints.map((p) => `- ${p}`).join("\n")}`
    : "";

  const response = await anthropic.messages.create({
    // Snabbare modell för att hinna klart inom Vercel Hobby-planens
    // 60-sekundersgräns för serverfunktioner. Byt till "claude-sonnet-5"
    // för högre kvalitet om ni uppgraderar till Vercel Pro (300s gräns).
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Ämne: ${subjectName}
Kapitel/provområde: ${chapterTitle}
Årskurs: ${gradeLevel}${pointList}

Material:
"""
${text}
"""

Generera frågorna enligt instruktionerna.`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI:n gav inget textsvar");
  }

  const raw = textBlock.text.trim();

  // Robust extraktion: leta upp den YTTERSTA arrayen ([ ... ]) i svaret,
  // oavsett om modellen la till kodstaket, en inledande mening eller
  // annat runtomkring — istället för att bara klippa bort ```json-rader.
  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    console.error("AI-svar innehöll ingen JSON-array. Rått svar (start):", raw.slice(0, 500));
    throw new Error("AI-svaret innehöll ingen lista att tolka");
  }

  const candidate = raw.slice(firstBracket, lastBracket + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (parseError) {
    // Reservplan: om svaret klipptes av mitt i sista frågan, försök rädda
    // de frågor som faktiskt hann bli kompletta istället för att kasta
    // bort hela batchen. Hittar sista "},\n" (avslutat objekt) och stänger
    // arrayen där.
    const lastCompleteObject = candidate.lastIndexOf("},");
    if (lastCompleteObject === -1) {
      console.error(
        "Kunde inte tolka AI-svaret som JSON, och kunde inte reparera det. Rått svar (start):",
        raw.slice(0, 500),
        "Rått svar (slut):",
        raw.slice(-500),
        "Parse-fel:",
        parseError,
      );
      throw new Error("Kunde inte tolka AI-svaret som JSON");
    }

    const repaired = candidate.slice(0, lastCompleteObject + 1) + "]";
    try {
      parsed = JSON.parse(repaired);
      console.error(
        "AI-svaret verkade avklippt — räddade de kompletta frågorna istället för att avbryta helt.",
      );
    } catch {
      console.error(
        "Kunde inte tolka AI-svaret som JSON, reparationsförsöket misslyckades också. Rått svar (start):",
        raw.slice(0, 500),
        "Rått svar (slut):",
        raw.slice(-500),
      );
      throw new Error("Kunde inte tolka AI-svaret som JSON");
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("AI-svaret var inte en lista med frågor");
  }

  return parsed as GeneratedQuestion[];
}
