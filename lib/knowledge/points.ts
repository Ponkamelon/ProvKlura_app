type Client = ReturnType<typeof import("@/lib/supabase/server").createClient>;

/**
 * Kunskapspunkter (steg 0): varje fråga kopplas till en punkt i
 * hierarkin ämne → område → punkt. Banken kommer från Baskunskapsbanken;
 * föräldrars egna set som inte matchar banken får fria punkter (source = 'set').
 */

export type KnowledgePoint = { id: string; subject: string; area: string; name: string; source: string };

/** Ämnena i Baskunskapsbanken, med ord som känns igen i förälderns ämnesnamn. */
const BANK_SUBJECTS: [string, RegExp][] = [
  ["Matematik", /\bmat(te|ematik)|\bmatte/i],
  ["Svenska", /svenska|\bsv\b/i],
  ["Engelska", /engelska|english/i],
  ["Biologi", /biologi|\bbio\b/i],
  ["Fysik", /fysik/i],
  ["Kemi", /kemi/i],
  ["Samhällskunskap", /samhäll|\bso\b|ekonomi/i],
  ["Historia", /histori/i],
  ["Geografi", /geografi|\bgeo\b/i],
  ["Religionskunskap", /religion/i],
];

/** "Nationell matematik" → "Matematik", "SO samhällsekonomi" → "Samhällskunskap", annars null. */
export function bankSubjectFor(subjectName: string): string | null {
  const name = subjectName.replace(/^Nationell\s+/i, "").trim();
  for (const [bank, re] of BANK_SUBJECTS) if (re.test(name)) return bank;
  return null;
}

export const pointLabel = (p: { area: string; name: string }) => `${p.area} › ${p.name}`;

/** Punkter AI:n får välja bland: bankens (och tilläggen) i ämnet plus setets egna. */
export async function loadCandidatePoints(
  supabase: Client,
  subjectName: string,
  studySetId: string,
  chapterTitle = "",
): Promise<KnowledgePoint[]> {
  // Ämnesnamnet först ("SO samhällsekonomi"), annars kapitlet ("So eko").
  const bankSubject = bankSubjectFor(subjectName) ?? bankSubjectFor(chapterTitle);
  const [bank, own] = await Promise.all([
    bankSubject
      ? supabase
          .from("knowledge_points")
          .select("id, subject, area, name, source")
          .is("study_set_id", null)
          .eq("subject", bankSubject)
          .order("sort_order")
      : Promise.resolve({ data: [] as KnowledgePoint[] }),
    supabase
      .from("knowledge_points")
      .select("id, subject, area, name, source")
      .eq("study_set_id", studySetId)
      .order("sort_order"),
  ]);
  return [...((bank.data ?? []) as KnowledgePoint[]), ...((own.data ?? []) as KnowledgePoint[])];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[›>|]/g, " ")
    .replace(/[^a-zåäöéü0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Översätter AI:ns val ("Område › Punkt") till punkt-id. Frågor där inget
 * passar får en fri punkt i setet (område = kapitlet, namn = knowledge_unit),
 * så att varje fråga alltid har en kunskapspunkt.
 */
export async function resolveKnowledgePoints(
  supabase: Client,
  params: {
    studySetId: string;
    subjectName: string;
    chapterTitle: string;
    candidates: KnowledgePoint[];
    choices: { knowledgePoint?: string | null; knowledgeUnit?: string | null }[];
  },
): Promise<(string | null)[]> {
  const byLabel = new Map(params.candidates.map((p) => [norm(pointLabel(p)), p.id]));
  const byName = new Map<string, string>();
  for (const p of params.candidates) if (!byName.has(norm(p.name))) byName.set(norm(p.name), p.id);

  const subject = params.subjectName.replace(/^Nationell\s+/i, "").trim().slice(0, 80) || "Övrigt";
  const area = params.chapterTitle.trim().slice(0, 80) || subject;
  const created = new Map<string, string>();
  const result: (string | null)[] = [];

  for (const choice of params.choices) {
    const pick = norm(choice.knowledgePoint ?? "");
    const unit = (choice.knowledgeUnit ?? "").trim();
    let id = (pick && (byLabel.get(pick) ?? byName.get(pick))) || (unit ? byName.get(norm(unit)) : undefined);

    if (!id && unit) {
      const name = unit.charAt(0).toUpperCase() + unit.slice(1, 120);
      const key = norm(name);
      id = created.get(key);
      if (!id) {
        const { data, error } = await supabase
          .from("knowledge_points")
          .insert({ subject, area, name, source: "set", study_set_id: params.studySetId })
          .select("id")
          .single();
        if (error) {
          // Finns redan (t.ex. från en tidigare del av samma set) — hämta den.
          const { data: existing } = await supabase
            .from("knowledge_points")
            .select("id")
            .eq("study_set_id", params.studySetId)
            .eq("area", area)
            .eq("name", name)
            .maybeSingle();
          id = existing?.id;
        } else {
          id = data.id;
        }
        if (id) created.set(key, id);
      }
    }
    result.push(id ?? null);
  }
  return result;
}

/** Kunskapsområden per test (från publicerade frågors punkter), i bankens ordning. */
export async function getSetAreas(supabase: Client, studySetIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!studySetIds.length) return result;
  const { data } = await supabase
    .from("questions")
    .select("study_set_id, knowledge_points(area, sort_order)")
    .in("study_set_id", studySetIds)
    .eq("status", "published")
    .not("knowledge_point_id", "is", null);
  const order = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as unknown as {
    study_set_id: string;
    knowledge_points: { area: string; sort_order: number } | null;
  }[]) {
    const kp = row.knowledge_points;
    if (!kp) continue;
    const areas = order.get(row.study_set_id) ?? new Map<string, number>();
    areas.set(kp.area, Math.min(areas.get(kp.area) ?? Infinity, kp.sort_order));
    order.set(row.study_set_id, areas);
  }
  for (const [setId, areas] of order) {
    result.set(setId, [...areas.entries()].sort((a, b) => a[1] - b[1]).map(([area]) => area));
  }
  return result;
}
