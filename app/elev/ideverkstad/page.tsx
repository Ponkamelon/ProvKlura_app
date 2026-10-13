import Link from "next/link";
import { WaveDivider } from "@/components/WaveDivider";
import { IdeaWorkshop } from "@/components/IdeaWorkshop";
import { requireProfile } from "@/lib/auth";

export default async function IdeverkstadPage() {
  await requireProfile("student");

  return (
    <div data-skrivklura>
      <Link href="/elev" className="text-sm text-navy/60 underline">
        ← Startsidan
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-navy">Idéverkstad</h1>
      <WaveDivider className="mt-2 h-3 w-24" color="#5B4B9E" />
      <p className="mt-3 text-navy/80">
        Fastnar du på vad du ska skriva? Svara på några frågor så får du ett exempel att hämta
        idéer från. Ändra svaren och testa igen – varje förslag blir olika.
      </p>
      <div className="mt-6">
        <IdeaWorkshop />
      </div>
    </div>
  );
}
