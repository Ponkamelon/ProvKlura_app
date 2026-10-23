import Image from "next/image";

type MedalTier = "brons" | "silver" | "guld";

/**
 * Poäng till buckla: 90%+ guld, 70%+ silver, 50%+ brons, annars ingen.
 */
export function medalForPercent(percent: number): MedalTier | null {
  if (percent >= 90) return "guld";
  if (percent >= 70) return "silver";
  if (percent >= 50) return "brons";
  return null;
}

const MEDAL_LABEL: Record<MedalTier, string> = {
  guld: "Guldmedalj",
  silver: "Silvermedalj",
  brons: "Bronsmedalj",
};

export function Medal({ tier, size = 96 }: { tier: MedalTier; size?: number }) {
  // Källbilden är ~220×180 (liggande), så vi räknar ut höjden proportionellt
  // istället för att tvinga fram en kvadrat och snedvrida medaljen.
  const height = Math.round(size * (180 / 220));

  return (
    <Image
      // Genomskinlig bakgrund, så medaljen ser rätt ut på både kort och sandbakgrund.
      src={`/medals/medalj-${tier}.png`}
      alt={MEDAL_LABEL[tier]}
      width={size}
      height={height}
      className="mx-auto"
    />
  );
}
