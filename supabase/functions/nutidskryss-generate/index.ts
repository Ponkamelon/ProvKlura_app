// Nutidskrysset — skapar veckans utkast från nyhetsflöden.
//
// Körs varje måndag av pg_cron (public.nutid_trigger_generation) och när
// en redaktör trycker "Skapa nytt utkast nu". Resultatet sparas ALLTID som
// utkast (status 'draft') — inget visas för elever förrän en redaktör har
// granskat och publicerat det i appen.
//
// Regler för innehållet:
// - Bara etablerade nyhetsredaktioner (SOURCES nedan), ingen alternativmedia.
// - En nyhet får bara användas om den finns hos minst två olika källor.
// - Svaren är begrepp ur skolans kunskapsbank; nyheten är bara ledtråden.
// - Tunga ämnen (krig, våld, brott, död, olyckor) och partipolitik spärras.
//
// layout.ts är en kopia av lib/nutid/layout.ts i appen.

import { layoutCrossword, normalizeAnswer } from "./layout.ts";

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

type Entry = {
  /** Rubrik-id:n ordet bygger på (används bara internt för att sprida orden över nyheter). */
  headlineIds?: number[];
  answer: string;
  clue: string;
  concept: string;
  subject: string;
  sources: { source: string; title: string; url: string }[];
};

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

/** Står svaret (eller dess stam) i någon av rubrikerna? Annars är kopplingen påhittad. */
function answerAppearsInHeadlines(answer: string, concept: string, cited: Headline[]) {
  const text = cited.map((h) => `${h.title} ${h.description}`).join(" ").toLowerCase();
  const stems = [answer, ...concept.split(/\s+/)]
    .map((w) => w.toLowerCase().replace(/[^a-zåäöéü]/g, ""))
    .filter((w) => w.length >= 2)
    .map((w) => (w.length > 6 ? w.slice(0, Math.max(5, w.length - 3)) : w.slice(0, Math.max(3, w.length - 1))));
  return stems.some((stem) => text.includes(stem));
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

const SYSTEM_PROMPT = `Du gör "Veckans nutidskryss" i ProvKlura, en studieapp för elever i årskurs 7–9. Många elever har svårt med koncentration och låg självkänsla. Krysset ska kännas lugnt, begripligt och lite roligt.

Du får veckans nyhetsrubriker från svenska nyhetsredaktioner, numrerade [id] och märkta med källa.

Uppgift: föreslå 12 ord till ett korsord (vi väljer sedan ut de som passar ihop).
- Utgå från NYHETERNA, inte från begreppslistan: hitta en nyhet som flera källor skriver om, och välj ett ord som faktiskt står i rubrikerna och som är ett begrepp eleven kan ha nytta av i skolan (t.ex. "klimatmål" → KLIMAT, "räntan sänks" → RÄNTA, "elpriset" → ELPRIS). Ordet (eller dess stam) MÅSTE stå i minst en av rubrikerna du anger — annars underkänns det.
- Hitta aldrig på en koppling. Passar inget skolbegrepp naturligt till en nyhet: hoppa över den nyheten.
- Svaret ska vara ETT ord, 3–12 bokstäver, med korrekt svensk stavning inklusive å, ä, ö. Landsnamn, personnamn och partinamn är INTE tillåtna som svar.
- Ledtråden kopplar begreppet till en nyhet från veckan, skriven med egna ord på enkel svenska. Max 18 ord. Den får INTE innehålla svaret, inte en böjning av det och inte ett sammansatt ord med svaret i (är svaret RÄNTA får ledtråden inte innehålla "räntan" eller "styrräntan").
- Varje ord ska bygga på en nyhet som finns hos MINST TVÅ OLIKA källor. Ange id:n för rubrikerna i "rubriker" — minst två id från olika källor som handlar om SAMMA händelse. Ta med alla rubriker du hittar om händelsen, gärna 3–4.
- "amne": skolämnet begreppet hör till (Samhällskunskap, Geografi, Historia, Biologi, Fysik, Kemi, Teknik).
- Sprid orden över OLIKA nyheter: högst två ord per nyhet. Ett kryss om bara en händelse blir tråkigt.
- Välj gärna ord som delar bokstäver med varandra, så de går att korsa.

Välj ALDRIG nyheter om: krig, väpnade konflikter, terror, våld, brott, olyckor, död, självmord, sjukdomsutbrott med döda, sex, droger, eller nyheter som handlar om en namngiven person (politiker, kändisar) eller ett parti. Nämn aldrig personnamn i ledtråden. Inga värderande eller politiskt vinklade ledtrådar — beskriv bara vad som hänt. Hellre ekonomi, väder och klimat, natur, vetenskap, rymden, teknik, sport, kultur och hur samhället fungerar.

Exempel på bra skolbegrepp (inspiration, inget krav): ${CONCEPTS.join(", ")}.

Svara ENDAST med giltig JSON utan markdown:
{"ord": [{"svar": "INFLATION", "ledtrad": "...", "begrepp": "inflation", "amne": "Samhällskunskap", "rubriker": [3, 41]}]}`;

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
      max_tokens: 3500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Veckans rubriker:\n${list}${feedback ? `\n\n${feedback}` : ""}` }],
    }),
    signal: AbortSignal.timeout(60000),
  });
}

async function askClaude(headlines: Headline[], feedback: string) {
  const list = headlines.map((h) => `[${h.id}] ${h.source}: ${h.title}${h.description ? ` — ${h.description}` : ""}`).join("\n");
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
    ord?: { svar?: string; ledtrad?: string; begrepp?: string; amne?: string; rubriker?: number[] }[];
  };
}

function validate(raw: Awaited<ReturnType<typeof askClaude>>, headlines: Headline[]) {
  const byId = new Map(headlines.map((h) => [h.id, h]));
  const entries: Entry[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const o of raw.ord ?? []) {
    const answer = normalizeAnswer(String(o.svar ?? ""));
    const clue = String(o.ledtrad ?? "").trim();
    const label = answer || String(o.svar ?? "?");
    if (answer.length < 3 || answer.length > 12) { rejected.push(`${label}: fel längd`); continue; }
    if (seen.has(answer)) { rejected.push(`${label}: dubblett`); continue; }
    if (!clue || clue.split(/\s+/).length > 22) { rejected.push(`${label}: ledtråd saknas eller för lång`); continue; }
    if (clue.toUpperCase().includes(answer.slice(0, Math.max(4, answer.length - 2)))) { rejected.push(`${label}: ledtråden avslöjar svaret`); continue; }
    const cited = [...new Set(o.rubriker ?? [])].map((id) => byId.get(Number(id))).filter((h): h is Headline => !!h);
    if (!confirmedByTwoSources(cited)) { rejected.push(`${label}: inte bekräftad av två källor`); continue; }
    if (!answerAppearsInHeadlines(answer, String(o.begrepp ?? ""), cited)) {
      rejected.push(`${label}: ordet finns inte i nyheterna det sägs bygga på`);
      continue;
    }
    const haystack = `${answer} ${clue} ${o.begrepp ?? ""} ${cited.map((h) => `${h.title} ${h.description}`).join(" ")}`;
    if (BLOCKED.test(haystack)) { rejected.push(`${label}: spärrat ämne`); continue; }
    seen.add(answer);
    entries.push({
      headlineIds: cited.map((h) => h.id),
      answer,
      clue,
      concept: String(o.begrepp ?? answer.toLowerCase()).slice(0, 60),
      subject: String(o.amne ?? "Samhällskunskap").slice(0, 40),
      sources: cited.map((h) => ({ source: h.source, title: h.title.slice(0, 200), url: h.url })),
    });
  }
  return { entries, rejected };
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
    return json({ weekStart, week, feedStats, sample: feeds.map((f) => ({ source: f.source, titles: f.items.slice(0, 5).map((i) => i.title) })) });
  }

  // Schemat hoppar över veckor där en redaktör redan publicerat ett kryss.
  if (mode === "cron" && (await hasPublishedForWeek(weekStart))) {
    return json({ skipped: "redan publicerat för veckan", weekStart });
  }

  const title = `Veckans nutidskryss · vecka ${week}`;

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

  try {
    let best: { entries: Entry[]; layout: ReturnType<typeof layoutCrossword> } | null = null;
    let feedback = "";
    let lastRejected: string[] = [];
    // Godkända ord sparas mellan rundorna, så runda två bygger vidare på
    // det som redan klarat kontrollerna istället för att börja om.
    const accepted: Entry[] = [];
    const startedAt = Date.now();
    for (let round = 0; round < 3; round++) {
      // Edge-funktioner har en tidsgräns; starta ingen ny runda efter 80 sekunder.
      if (round > 0 && Date.now() - startedAt > 80_000) break;
      const raw = await askClaude(headlines, feedback);
      const { entries: fresh, rejected } = validate(raw, headlines);
      for (const e of fresh) {
        if (accepted.some((a) => a.answer === e.answer)) continue;
        // Högst två ord per nyhet: räkna godkända ord som delar någon rubrik med det här.
        const sameStory = accepted.filter((a) => a.headlineIds?.some((id) => e.headlineIds?.includes(id))).length;
        if (sameStory >= 2) {
          rejected.push(`${e.answer}: samma nyhet används redan av två ord`);
          continue;
        }
        accepted.push(e);
      }
      const entries = accepted;
      lastRejected = rejected;
      console.log("nutidskryss runda", round + 1, "godkända:", entries.map((e) => e.answer), "underkända:", rejected);
      const layout = layoutCrossword(entries.map((e) => e.answer));
      const placed = layout.placements.map((p) => entries[p.index]);
      const finalLayout = layoutCrossword(placed.map((e) => e.answer));
      if (!best || placed.length > best.entries.length) best = { entries: placed, layout: finalLayout };
      if (placed.length >= 5) break;
      feedback = `Förra försöket gav bara ${placed.length} användbara ord (minst 5 behövs). Underkända: ${rejected.join("; ") || "inga"}. Ord som inte gick att korsa: ${entries.filter((_, i) => !layout.placements.some((p) => p.index === i)).map((e) => e.answer).join(", ") || "inga"}. Behåll inte de godkända orden (${entries.map((e) => e.answer).join(", ") || "inga"}) — föreslå 12 NYA ord som delar bokstäver med dem.`;
    }

    if (!best || best.entries.length < 5) {
      return fail(
        `AI:n hittade bara ${best?.entries.length ?? 0} ord som klarade kontrollerna (minst 5 behövs). ` +
          `Underkända: ${lastRejected.slice(0, 12).join("; ") || "inga"}.`,
      );
    }

    const row = await insertKryss({
      week_start: weekStart,
      status: "draft",
      title,
      entries: best.entries.map(({ headlineIds: _ids, ...e }) => e),
      layout: best.layout,
    });
    return json({ status: "draft", id: row.id, words: best.entries.length, feedStats });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
});
