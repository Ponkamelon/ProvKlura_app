import Link from "next/link";
import { redirect } from "next/navigation";
import { WaveDivider } from "@/components/WaveDivider";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { stockholmTodayIso } from "@/lib/nutid/week";
import { Icon } from "@/components/Icon";

type Row = { metric: string; value: number | null; numerator: number | null; denominator: number | null; note: string };

/** Loggningen startade (steg 0). Nuläget mäts härifrån i 2–3 veckor. */
const MEASUREMENT_START = "2026-10-23";

const PERIODS = [
  { key: "start", label: "Sedan mätstart" },
  { key: "7", label: "7 dagar" },
  { key: "14", label: "14 dagar" },
  { key: "21", label: "21 dagar" },
];

function addDays(iso: string, delta: number) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}

/**
 * Nulägesmätning enligt kravspecens avsnitt 11. Bara redaktörer ser sidan,
 * och den visar bara sammanräknade tal — aldrig enskilda elever.
 */
export default async function MatningPage({ searchParams }: { searchParams: { period?: string } }) {
  await requireProfile("admin");
  const supabase = createClient();
  const { data: isEditor } = await supabase.rpc("is_content_editor");
  if (isEditor !== true) redirect("/admin");

  const today = stockholmTodayIso();
  const period = PERIODS.find((p) => p.key === searchParams.period) ?? PERIODS[0];
  const from = period.key === "start" ? MEASUREMENT_START : addDays(today, -(Number(period.key) - 1));

  const { data, error } = await supabase.rpc("matning_nulage", { p_from: from, p_to: today });
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <Link href="/admin" className="link-back">
        <Icon name="tillbaka" size={16} />
        Startsidan
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Mätning av nuläget</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#FF6B4A" />
      <p className="mt-4 max-w-2xl text-navy/70">
        Måtten från kravspecens avsnitt 11, räknade på händelseloggen. Loggningen startade{" "}
        {MEASUREMENT_START}. Låt den gå 2–3 veckor innan elevfunktionerna i steg 1 lanseras, så att
        förbättringsmålen kan sättas utifrån ett riktigt nuläge. Bara sammanräknade tal visas.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Period">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/matning?period=${p.key}`}
            aria-current={p.key === period.key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${
              p.key === period.key ? "bg-ocean text-white" : "bg-white/70 text-navy hover:bg-seafoam"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <p className="mt-2 text-sm text-navy/60">
        {from} – {today}
      </p>

      {error ? (
        <p className="mt-6 text-coral-dark">Kunde inte hämta mätningen: {error.message}</p>
      ) : (
        <div className="notebook-card mt-4 overflow-x-auto p-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-navy/60">
                <th className="p-2 font-medium">Mått</th>
                <th className="p-2 text-right font-medium">Värde</th>
                <th className="p-2 text-right font-medium">Underlag</th>
                <th className="hidden p-2 font-medium sm:table-cell">Vad det betyder</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metric} className="border-t border-sand-deep align-top">
                  <td className="p-2 font-medium text-navy">
                    {r.metric}
                    <span className="block text-xs font-normal text-navy/60 sm:hidden">{r.note}</span>
                  </td>
                  <td className="p-2 text-right font-mono text-navy">
                    {r.value !== null ? `${String(r.value).replace(".", ",")} %` : r.numerator ?? "–"}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right font-mono text-navy/60">
                    {r.denominator !== null ? `${r.numerator ?? 0} / ${r.denominator}` : ""}
                  </td>
                  <td className="hidden p-2 text-navy/70 sm:table-cell">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-navy/50">
        Litet underlag ger osäkra tal. Testkort och rekommendationsrad finns först i steg 1, så de
        måtten är tomma tills dess.
      </p>
    </div>
  );
}
