// Nutidskrysset — skapar veckans utkast från nyhetsflöden: tio frågor med
// tre svarsalternativ (1, X, 2), som "nutidskrysset" i skolan.
//
// Körs varje måndag av pg_cron (public.nutid_trigger_generation) och när
// en redaktör trycker "Skapa nytt utkast nu". Resultatet sparas ALLTID som
// utkast (status 'draft') — inget visas för elever förrän en redaktör har
// granskat och publicerat det i appen.
//
// Regler för innehållet:
// - Bara etablerade nyhetsredaktioner (SOURCES nedan), ingen alternativmedia.
// - En nyhet får bara användas om den finns hos minst två olika källor.
// - Rätt svar måste gå att hitta i rubrikerna frågan bygger på.
// - Tunga ämnen (krig, våld, brott, död, olyckor) och partipolitik spärras.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_WORKSPACE_ID = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
// Urvalet kräver omdöme (vilken nyhet hör ihop med vilket begrepp), så en
// starkare modell provas först. Saknar nyckeln åtkomst faller vi tillbaka
// på Haiku, som resten av appen använder. Körs bara en gång i veckan.
const MODELS = ["claude-sonnet-4-5", "claude-haiku-4-5-20251001"];

type Source = { name: string; urls: string[] };

const SOURCES: Source[] = [
  { name: "SVT", urls: ["https://www.svt.se/nyheter/rss.xml", "https://www.svt.se/rss.xml"] },
  { name: "Sveriges Radio", urls: ["https://api.sr.se/api/rss/program/83"] },
  { name: "DN", urls: ["https://www.dn.se/rss/", "https://www.dn.se/nyheter/rss/"] },
  { name: "SvD", urls: ["https://www.svd.se/feed/articles.rss", "https://www.svd.se/?service=rss"] },
  { name: "Aftonbladet", urls: ["https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/", "https://rss.aftonbladet.se/rss2/small/pages/sections/nyheter/"] },
  { name: "Expressen", urls: ["https://feeds.expressen.se/nyheter/", "https://feeds.expressen.se/nyhetsflodet/"] },
];

/** Begrepp ur ProvKluras baskunskapsbank som passar nutid. Svaren bör helst vara härifrån. */
const CONCEPTS = [
  "demokrati", "diktatur", "val", "rösträtt", "riksdag", "regering", "statsminister", "minister", "kommun", "region",
  "grundlag", "lag", "opposition", "majoritet", "minoritet", "ideologi", "EU", "Europaparlamentet", "FN",
  "domstol", "åklagare", "rättssäkerhet",
  "inkomst", "utgift", "budget", "skatt", "ränta", "lån", "inflation", "arbetslöshet", "konjunktur", "utbud",
  "efterfrågan", "export", "import", "handel", "globalisering", "tull", "lön", "pension",
  "välfärd", "jämställdhet", "diskriminering", "migration", "integration", "urbanisering", "befolkning",
  "yttrandefrihet", "pressfrihet", "desinformation", "propaganda", "algoritm", "källkritik", "källa",
  "klimat", "väder", "nederbörd", "temperatur", "växthuseffekt", "koldioxid", "klimatanpassning", "utsläpp",
  "återvinning", "förnybar", "solenergi", "vindkraft", "kärnkraft", "elpris", "energi", "fossila bränslen",
  "biologisk mångfald", "ekosystem", "skog", "jordbruk", "vatten", "översvämning", "torka", "storm",
  "vaccin", "bakterier", "virus", "antibiotika", "immunförsvar",
  "rymden", "satellit", "månen", "planet", "teknik", "forskning", "uppfinning", "AI",
];

const BLOCKED = /\b(krig|krigs|döda|dödad|dödade|dödats|död|döds|dödsfall|mord|mörd|mördad|skjut|skott|skottlossning|terror|våld|våldt|kniv|knivhugg|bomb|explosion|sprängning|attack|gisslan|kidnapp|självmord|suicid|knark|narkotika|droger|sexuell|porr|gäng|rån|misshandel|olycka|omkom|avled|avliden|offer|massaker|invasion|missil|drönarattack|ukrain|ryssland|gaza|israel|hamas|hizbollah|socialdemokrat|moderat|sverigedemokrat|vänsterpartiet|centerpartiet|liberalerna|kristdemokrat|miljöpartiet)/i;

type Headline = { id: number; source: string; title: string; description: string; url: string };

type Question = {
  /** Rubrik-id:n frågan bygger på (bara internt, för att sprida frågorna över nyheter). */
  headlineIds?: number[];
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  subject: string;
  sources: { source: string; title: string; url: string }[];
};

const TARGET = 10;
const MIN_QUESTIONS = 6;

const STOPWORDS = new Set([
  "efter", "under", "inför", "kommer", "säger", "sedan", "kunde", "skulle", "många", "andra", "första",
  "också", "bland", "mellan", "därför", "stora", "större", "något", "några", "detta", "deras", "varför",
  "sverige", "svenska", "svensk", "svenskar", "nyheter", "senaste", "veckan", "dagen", "kväll", "morgon",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function insertKryss(row: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/nutidskryss`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert: ${res.status} ${await res.text()}`);
  return (await res.json())[0];
}

async function hasPublishedForWeek(weekStart: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/nutidskryss?select=id&status=eq.published&is_evergreen=eq.false&week_start=eq.${weekStart}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  return res.ok && ((await res.json()) as unknown[]).length > 0;
}

/** Måndagen i den här veckan (svensk tid) + veckonummer. */
function currentWeek() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const today = new Date(`${parts}T12:00:00Z`);
  const weekday = (today.getUTCDay() + 6) % 7; // måndag = 0
  const monday = new Date(today.getTime() - weekday * 86400000);
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekStart: monday.toISOString().slice(0, 10), week };
}

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/<[^>]+>/g, " ") // en del flöden har HTML som entiteter (&lt;p&gt;)
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

async function fetchSource(source: Source) {
  for (const url of source.urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "ProvKlura-Nutidskryss/1.0 (+https://provplugg.vercel.app)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
      const weekAgo = Date.now() - 8 * 86400000;
      const items = blocks
        .map((b) => {
          const linkHref = b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
          const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published");
          return {
            title: tag(b, "title"),
            description: (tag(b, "description") || tag(b, "summary")).slice(0, 140),
            url: tag(b, "link") || linkHref || "",
            time: date ? Date.parse(date) : NaN,
          };
        })
        .filter((i) => i.title && (Number.isNaN(i.time) || i.time >= weekAgo))
        .slice(0, 40);
      if (items.length) return { source: source.name, url, items };
    } catch {
      // prova nästa adress
    }
  }
  return { source: source.name, url: null as string | null, items: [] as { title: string; description: string; url: string }[] };
}

/** Ordstammar (första 5 bokstäverna) så att "räntan" och "räntor" räknas som samma ord. */
function significantWords(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zåäöéü]+/)
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w))
      .map((w) => w.slice(0, 5)),
  );
}

/**
 * Går rätt svar att hitta i nyheterna? Minst två ordstammar ur frågan och
 * det rätta alternativet ska stå i rubrikerna, och alla tal i det rätta
 * alternativet måste finnas där. Annars kan AI:n ha hittat på.
 */
function supportedByHeadlines(question: string, correctOption: string, cited: Headline[]) {
  const text = cited.map((h) => `${h.title} ${h.description}`).join(" ").toLowerCase();
  const numbers = correctOption.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numbers.some((n) => !text.includes(n))) return false;
  const stems = [...new Set(
    `${question} ${correctOption}`
      .toLowerCase()
      .split(/[^a-zåäöéü]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .map((w) => w.slice(0, Math.max(4, Math.min(6, w.length - 1)))),
  )];
  const hits = stems.filter((stem) => text.includes(stem)).length;
  return hits >= 2;
}

/** Minst två olika källor, och rubrikerna från olika källor måste dela ett ord — så AI:n inte parar ihop olika nyheter. */
function confirmedByTwoSources(cited: Headline[]) {
  const bySource = new Map<string, Headline[]>();
  for (const h of cited) bySource.set(h.source, [...(bySource.get(h.source) ?? []), h]);
  if (bySource.size < 2) return false;
  for (let i = 0; i < cited.length; i++) {
    for (let j = i + 1; j < cited.length; j++) {
      if (cited[i].source === cited[j].source) continue;
      const a = significantWords(`${cited[i].title} ${cited[i].description}`);
      const b = significantWords(`${cited[j].title} ${cited[j].description}`);
      for (const w of a) if (b.has(w)) return true;
    }
  }
  return false;
}

type Story = { id: number; headlines: Headline[] };

/**
 * Grupperar rubriker som handlar om samma händelse och behåller bara de
 * grupper som minst två olika redaktioner skrivit om. Två rubriker från
 * olika källor hör ihop om de delar minst två ordstammar som inte är för
 * vanliga i veckans flöde (ovanliga ord, t.ex. ett företagsnamn, väger tyngst).
 */
function findStories(headlines: Headline[]): Story[] {
  const n = headlines.length;
  const stems = headlines.map((h) => significantWords(`${h.title} ${h.description}`));
  const df = new Map<string, number>();
  for (const set of stems) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
  // Ovanliga ord väger tyngst (idf). Två vanliga ord räcker inte, två
  // halvovanliga eller ett ovanligt plus ett till gör det.
  const weight = (w: string) => Math.log(n / (df.get(w) ?? n));
  const threshold = Math.log(n / 3);

  const pairs: { i: number; j: number; score: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (headlines[i].source === headlines[j].source) continue;
      let score = 0;
      let shared = 0;
      for (const w of stems[i]) {
        if (!stems[j].has(w) || (df.get(w) ?? 0) > n / 8) continue;
        score += weight(w);
        shared++;
      }
      // Minst två gemensamma ord — ett enda ord kan vara en slump.
      if (shared >= 2 && score >= threshold) pairs.push({ i, j, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  // Slå ihop starkaste paren först, men låt aldrig en grupp växa sig stor
  // — annars kedjas olika nyheter ihop till en enda klump.
  const MAX_GROUP = 8;
  const group = headlines.map((_, i) => i);
  const members = new Map<number, number[]>(headlines.map((_, i) => [i, [i]]));
  for (const { i, j } of pairs) {
    const a = group[i];
    const b = group[j];
    if (a === b) continue;
    const ma = members.get(a)!;
    const mb = members.get(b)!;
    if (ma.length + mb.length > MAX_GROUP) continue;
    for (const k of mb) group[k] = a;
    members.set(a, [...ma, ...mb]);
    members.delete(b);
  }

  return [...members.values()]
    .map((idx) => idx.map((k) => headlines[k]))
    .filter((g) => new Set(g.map((h) => h.source)).size >= 2)
    .filter((g) => !BLOCKED.test(g.map((h) => `${h.title} ${h.description}`).join(" ")))
    .sort((a, b) => new Set(b.map((h) => h.source)).size - new Set(a.map((h) => h.source)).size)
    .slice(0, 25)
    .map((g, i) => ({ id: i + 1, headlines: g }));
}

const SYSTEM_PROMPT = `Du gör "Nutidskrysset" i ProvKlura, en studieapp för elever i årskurs 7–9. Det är som nutidskrysset i skolan: frågor om veckans nyheter med tre svarsalternativ, 1, X och 2. Många elever har svårt med koncentration och låg självkänsla, så frågorna ska vara tydliga, korta och gå att svara på för den som har följt nyheterna lite grann.

Du får veckans nyheter, grupperade: varje NYHET har rubriker från minst två olika redaktioner. Rubrikerna är numrerade [id] och märkta med källa.

Uppgift: skriv 12 frågor (vi väljer sedan ut tio).
- Varje fråga handlar om EN av nyheterna. Ange id:n för nyhetens rubriker i "rubriker" — minst två id från olika källor, gärna alla som handlar om händelsen.
- Hoppa över nyheter som inte passar för elever (se listan längre ner) eller där rubrikerna inte räcker för en tydlig fråga.
- Det rätta svaret måste gå att utläsa direkt ur rubrikerna du anger. Hitta aldrig på siffror, namn eller detaljer som inte står där. Siffror i rätt svar måste stå i rubrikerna.
- Frågan: max 20 ord, enkel svenska, en sak i taget. Förklara kort sammanhanget i frågan om det behövs ("FN har släppt en klimatrapport. Hur många graders uppvärmning varnar den för?").
- Tre alternativ, korta (max 8 ord), ungefär lika långa. Ett rätt. De två fel ska vara rimliga men tydligt fel för den som läst nyheten — inga lurfrågor, inget "alla stämmer".
- "forklaring": en mening om nyheten, som eleven ser efter att ha svarat (max 25 ord).
- "amne": skolämnet frågan hör till (Samhällskunskap, Geografi, Historia, Biologi, Fysik, Kemi, Teknik, Idrott).
- Sprid frågorna över OLIKA nyheter: högst två frågor per nyhet.
- Koppla gärna till ett skolbegrepp (t.ex. inflation, riksdag, klimat, export), men det är inget krav.

Välj ALDRIG nyheter om: krig, väpnade konflikter, terror, våld, brott, olyckor, död, självmord, sjukdomsutbrott med döda, sex, droger, eller nyheter som handlar om en namngiven person (politiker, kändisar) eller ett parti. Nämn aldrig personnamn. Inga värderande eller politiskt vinklade frågor — fråga bara om vad som hänt. Hellre ekonomi, väder och klimat, natur, vetenskap, rymden, teknik, sport, kultur och hur samhället fungerar.

Exempel på bra skolbegrepp (inspiration): ${CONCEPTS.join(", ")}.

Svara ENDAST med giltig JSON utan markdown:
{"fragor": [{"fraga": "...", "alternativ": ["...", "...", "..."], "ratt": 0, "forklaring": "...", "amne": "Samhällskunskap", "rubriker": [3, 41]}]}
"ratt" är index för rätt alternativ (0, 1 eller 2).`;

let workingModel: string | null = null;

async function callModel(model: string, list: string, feedback: string) {
  return await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model,
      max_tokens: 4500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Veckans nyheter:\n\n${list}${feedback ? `\n\n${feedback}` : ""}` }],
    }),
    signal: AbortSignal.timeout(60000),
  });
}

async function askClaude(stories: Story[], feedback: string) {
  const list = stories
    .map((s) => `NYHET ${s.id}\n${s.headlines.map((h) => `  [${h.id}] ${h.source}: ${h.title}${h.description ? ` — ${h.description}` : ""}`).join("\n")}`)
    .join("\n\n");
  let res: Response | null = null;
  let lastError = "";
  for (const model of workingModel ? [workingModel] : MODELS) {
    res = await callModel(model, list, feedback);
    if (res.ok) {
      workingModel = model;
      break;
    }
    lastError = `Anthropic ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`;
    // Bara "modellen finns inte / ingen åtkomst" ska ge nästa modell en chans.
    if (![400, 403, 404].includes(res.status)) break;
    console.log("Modellen gick inte att använda, provar nästa:", lastError);
    res = null;
  }
  if (!res || !res.ok) throw new Error(lastError || "AI-anropet misslyckades");
  const data = await res.json();
  const text: string = data.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("AI-svaret innehöll ingen JSON");
  return JSON.parse(text.slice(first, last + 1)) as {
    fragor?: { fraga?: string; alternativ?: unknown[]; ratt?: unknown; forklaring?: string; amne?: string; rubriker?: number[] }[];
  };
}

/** Blandar alternativen så att rätt svar inte alltid hamnar på 1. */
function shuffleOptions(options: string[], correct: number) {
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  return { options: order.map((i) => options[i]), correct: order.indexOf(correct) };
}

function validate(raw: Awaited<ReturnType<typeof askClaude>>, headlines: Headline[], stories: Story[]) {
  const byId = new Map(headlines.map((h) => [h.id, h]));
  const storyOf = new Map<number, Story>();
  for (const s of stories) for (const h of s.headlines) storyOf.set(h.id, s);
  const questions: Question[] = [];
  const rejected: string[] = [];
  for (const [n, o] of (raw.fragor ?? []).entries()) {
    const question = String(o.fraga ?? "").trim();
    const label = `Fråga ${n + 1} (${question.slice(0, 40)}…)`;
    const options = Array.isArray(o.alternativ) ? o.alternativ.map((x) => String(x ?? "").trim()) : [];
    const rawCorrect = typeof o.ratt === "string" ? ({ "1": 0, X: 1, x: 1, "2": 2 } as Record<string, number>)[o.ratt] ?? Number(o.ratt) : Number(o.ratt);
    if (question.length < 8 || question.split(/\s+/).length > 30) { rejected.push(`${label}: frågan saknas eller är för lång`); continue; }
    if (options.length !== 3 || options.some((x) => !x || x.length > 120)) { rejected.push(`${label}: inte tre korta alternativ`); continue; }
    if (new Set(options.map((x) => x.toLowerCase())).size !== 3) { rejected.push(`${label}: två alternativ är likadana`); continue; }
    if (![0, 1, 2].includes(rawCorrect)) { rejected.push(`${label}: rätt svar saknas`); continue; }
    const picked = [...new Set(o.rubriker ?? [])].map((id) => byId.get(Number(id))).filter((h): h is Headline => !!h);
    // Frågan hör till den nyhet (grupp) som de flesta angivna rubrikerna ligger i.
    // Hela gruppen räknas som underlag — den har redan minst två redaktioner.
    const counts = new Map<Story, number>();
    for (const h of picked) {
      const st = storyOf.get(h.id);
      if (st) counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    const story = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const cited = story ? story.headlines : picked;
    if (!story && !confirmedByTwoSources(cited)) { rejected.push(`${label}: inte bekräftad av två källor`); continue; }
    if (!supportedByHeadlines(question, options[rawCorrect], cited)) {
      rejected.push(`${label}: rätt svar går inte att hitta i nyheterna`);
      continue;
    }
    const haystack = `${question} ${options.join(" ")} ${o.forklaring ?? ""} ${cited.map((h) => `${h.title} ${h.description}`).join(" ")}`;
    if (BLOCKED.test(haystack)) { rejected.push(`${label}: spärrat ämne`); continue; }
    const shuffled = shuffleOptions(options, rawCorrect);
    questions.push({
      headlineIds: cited.map((h) => h.id),
      question: question.slice(0, 300),
      options: shuffled.options,
      correct: shuffled.correct,
      explanation: String(o.forklaring ?? "").trim().slice(0, 300),
      subject: String(o.amne ?? "Samhällskunskap").slice(0, 40),
      sources: cited.map((h) => ({ source: h.source, title: h.title.slice(0, 200), url: h.url })),
    });
  }
  return { questions, rejected };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = req.headers.get("x-nutid-secret") ?? "";
  const allowed = secret ? await rpc("nutid_check_trigger_secret", { p_secret: secret }).catch(() => false) : false;
  if (allowed !== true) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const mode: string = body?.mode ?? "cron";
  const { weekStart, week } = currentWeek();

  const feeds = await Promise.all(SOURCES.map(fetchSource));
  const feedStats = feeds.map((f) => ({ source: f.source, url: f.url, items: f.items.length }));

  if (mode === "dry") {
    let id = 1;
    const all: Headline[] = feeds.flatMap((f) => f.items.map((i) => ({ id: id++, source: f.source, title: i.title, description: i.description, url: i.url })));
    const stories = findStories(all);
    return json({
      weekStart,
      week,
      feedStats,
      stories: stories.map((s) => s.headlines.map((h) => `${h.source}: ${h.title}`)),
      ...(body?.raw ? { headlines: all } : {}),
    });
  }

  // Schemat hoppar över veckor där en redaktör redan publicerat ett kryss.
  if (mode === "cron" && (await hasPublishedForWeek(weekStart))) {
    return json({ skipped: "redan publicerat för veckan", weekStart });
  }

  const title = `Nutidskrysset · vecka ${week}`;

  const fail = async (error: string) => {
    const row = await insertKryss({ week_start: weekStart, status: "failed", title, error, entries: [] });
    return json({ status: "failed", id: row.id, error, feedStats }, 200);
  };

  const workingSources = feeds.filter((f) => f.items.length).length;
  if (workingSources < 2) {
    return fail(`Bara ${workingSources} nyhetskälla svarade. Minst två behövs för att kunna jämföra.`);
  }
  if (!ANTHROPIC_API_KEY) {
    return fail("ANTHROPIC_API_KEY saknas bland Supabase-hemligheterna (Edge Functions → Secrets).");
  }

  let nextId = 1;
  const headlines: Headline[] = feeds.flatMap((f) =>
    f.items.map((i) => ({ id: nextId++, source: f.source, title: i.title, description: i.description, url: i.url })),
  );

  const stories = findStories(headlines);
  if (stories.length < 3) {
    return fail(`Bara ${stories.length} nyheter fanns hos minst två redaktioner den här veckan.`);
  }

  try {
    const accepted: Question[] = [];
    // Frågor som bara föll på "högst två per nyhet" — används om krysset annars blir för kort.
    const overflow: Question[] = [];
    let lastRejected: string[] = [];
    let feedback = "";
    const startedAt = Date.now();
    const sameText = (a: Question, b: Question) => a.question.toLowerCase() === b.question.toLowerCase();

    for (let round = 0; round < 3; round++) {
      // Edge-funktioner har en tidsgräns; starta ingen ny runda efter 80 sekunder.
      if (round > 0 && Date.now() - startedAt > 80_000) break;
      const raw = await askClaude(stories, feedback);
      const { questions: fresh, rejected } = validate(raw, headlines, stories);
      for (const q of fresh) {
        if (accepted.length >= TARGET) break;
        if (accepted.some((a) => sameText(a, q))) continue;
        const sameStory = accepted.filter((a) => a.headlineIds?.some((id) => q.headlineIds?.includes(id))).length;
        if (sameStory >= 2) {
          rejected.push(`${q.question.slice(0, 40)}…: samma nyhet har redan två frågor`);
          if (!overflow.some((o) => sameText(o, q))) overflow.push(q);
          continue;
        }
        accepted.push(q);
      }
      lastRejected = rejected;
      console.log("nutidskryss runda", round + 1, "godkända:", accepted.length, "underkända:", rejected);
      if (accepted.length >= TARGET) break;
      feedback = `Förra försöket gav bara ${accepted.length} godkända frågor (vi behöver ${TARGET}). Underkända: ${rejected.join("; ") || "inga"}. Skriv 12 NYA frågor om andra nyheter än dessa redan godkända: ${accepted.map((a) => a.question).join(" | ") || "inga"}.`;
    }

    // Spridning över nyheter är ett önskemål, inte ett krav.
    for (const q of overflow) {
      if (accepted.length >= TARGET) break;
      if (!accepted.some((a) => sameText(a, q))) accepted.push(q);
    }

    if (accepted.length < MIN_QUESTIONS) {
      return fail(
        `AI:n hittade bara ${accepted.length} frågor som klarade kontrollerna (minst ${MIN_QUESTIONS} behövs). ` +
          `Underkända: ${lastRejected.slice(0, 10).join("; ") || "inga"}.`,
      );
    }

    const row = await insertKryss({
      week_start: weekStart,
      status: "draft",
      title,
      entries: accepted.map(({ headlineIds: _ids, ...q }) => q),
    });
    return json({ status: "draft", id: row.id, questions: accepted.length, feedStats });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});
