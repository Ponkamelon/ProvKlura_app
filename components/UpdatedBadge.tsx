/**
 * Liten markering för eleven: testet har fått nya formuleringar sedan
 * eleven senast gjorde det. Försvinner när eleven har gjort testet igen.
 */
export function UpdatedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/30 px-2 py-0.5 text-xs font-semibold text-navy ${className}`}
      title="Frågorna har fått nya formuleringar sedan sist"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none">
        <path
          d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Uppdaterat
    </span>
  );
}
