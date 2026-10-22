"use client";

import { useState } from "react";
import { requestRenewalAction, type RenewalRequestResult } from "@/app/actions/renewal";
import { Icon } from "@/components/Icon";
import { joinNames } from "@/lib/renewal/requests";

/**
 * Eleven har fått alla rätt och kan be föräldern förnya testet. Föräldern
 * får en röd prick på testet.
 */
export function RenewalRequestButton({
  studySetId,
  alreadyRequested = false,
}: {
  studySetId: string;
  alreadyRequested?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RenewalRequestResult | null>(null);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      setResult(await requestRenewalAction(studySetId));
    } catch {
      setResult({ status: "error" });
    } finally {
      setSending(false);
    }
  }

  if (alreadyRequested && !result) {
    return (
      <p className="text-sm text-navy/70">
        ✓ Du har bett om ett nytt test. Det dyker upp här när det är förnyat.
      </p>
    );
  }

  if (result) {
    let text: string;
    switch (result.status) {
      case "sent":
        text = `Skickat till ${joinNames(result.names) || "din förälder"}! Testet märks med en röd prick hos ${result.names.length > 1 ? "dem" : "hen"}.`;
        break;
      case "already":
        text = `Du har redan bett ${joinNames(result.names) || "din förälder"} om det. Testet dyker upp med nya formuleringar när det är förnyat.`;
        break;
      case "not_eligible":
        text = "Gör testet med alla rätt först, så kan du be om ett nytt.";
        break;
      case "no_recipient":
        text = "Ingen förälder har delat testet med dig, så det finns ingen att skicka till.";
        break;
      default:
        text = "Det gick inte att skicka just nu. Försök igen om en stund.";
    }
    const ok = result.status === "sent" || result.status === "already";
    return (
      <p role="status" className={`text-sm ${ok ? "text-ocean-dark" : "text-navy/70"}`}>
        {ok && "✓ "}
        {text}
      </p>
    );
  }

  return (
    <button type="button" onClick={send} disabled={sending} className="btn-primary disabled:opacity-50">
      <Icon name="formulera-om" />
      {sending ? "Skickar…" : "Be om ett nytt test"}
    </button>
  );
}
