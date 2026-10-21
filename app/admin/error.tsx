"use client";

import { useEffect } from "react";

/**
 * Visas om något går snett på en sida eller när en knapp skickar något —
 * till exempel om mobilen tappar uppkopplingen mitt i. Istället för en
 * tom skärm med "Application error" får man en förklaring och en knapp.
 */
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="notebook-card mx-auto mt-10 max-w-md p-8 text-center">
      <h1 className="font-display text-2xl font-semibold text-navy">Hoppsan, något hakade upp sig</h1>
      <p className="mt-3 text-navy/70">
        Det kan bero på att uppkopplingen tappades en kort stund. Inget du gjort har försvunnit.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Försök igen
        </button>
        <button type="button" onClick={() => window.location.reload()} className="btn-secondary">
          Ladda om sidan
        </button>
      </div>
    </div>
  );
}
