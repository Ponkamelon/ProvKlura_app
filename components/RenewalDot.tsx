/**
 * Röd prick för föräldern: en elev har fått alla rätt och vill att testet
 * förnyas. Texten läses upp av skärmläsare och visas när man håller över.
 */
export function RenewalDot({ label = "En elev vill att testet förnyas", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-alert ring-2 ring-white ${className}`}
    />
  );
}
