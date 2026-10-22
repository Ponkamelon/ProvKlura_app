import Link from "next/link";
import { dismissRenewalAction } from "@/app/actions/renewal";
import { RenewalDot } from "@/components/RenewalDot";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { joinNames, type OpenRenewal } from "@/lib/renewal/requests";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });

/**
 * Visas inne i testet för föräldern: vem som fått alla rätt och vill ha
 * testet förnyat, och när. Försvinner när en ny formulering aktiveras
 * eller när föräldern väljer "Inte nu".
 */
export function RenewalBanner({
  studySetId,
  requests,
  returnPath,
  showRewordLink = true,
  compact = false,
}: {
  studySetId: string;
  requests: OpenRenewal[];
  returnPath: string;
  showRewordLink?: boolean;
  compact?: boolean;
}) {
  if (!requests.length) return null;
  const names = joinNames(requests.map((r) => r.studentName));
  const latest = requests[requests.length - 1];

  return (
    <div
      role="status"
      className={`rounded-xl border-2 border-alert/40 bg-alert/5 ${compact ? "mt-3 p-3" : "mt-6 p-4"}`}
    >
      <p className="flex items-start gap-2 font-medium text-navy">
        <RenewalDot className="mt-1.5" label="Önskemål om förnyat test" />
        <span>
          {names} fick alla rätt och vill att testet förnyas
          <span className="block text-sm font-normal text-navy/60">Skickat {fmt(latest.createdAt)}</span>
        </span>
      </p>
      {!compact && (
        <p className="mt-2 text-sm text-navy/70">
          Förnya betyder att frågorna och svaren får nya formuleringar. Samma kunskap testas, men med
          andra ord. Ordningen på frågor och svarsalternativ blandas om varje gång.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {showRewordLink && (
          <Link href={`/admin/omformulera/${studySetId}`} className="btn-primary px-4 py-2 text-sm">
            <Icon name="formulera-om" size={18} />
            Förnya testet
          </Link>
        )}
        <form action={dismissRenewalAction.bind(null, studySetId, returnPath)}>
          <SubmitButton pendingText="Sparar…" className="btn-secondary px-4 py-2 text-sm">
            Inte nu
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
