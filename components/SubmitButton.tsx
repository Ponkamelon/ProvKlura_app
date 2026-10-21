"use client";

import { useFormStatus } from "react-dom";

/**
 * Vanlig submit-knapp, men visar tydligt att något pågår medan en
 * Server Action kör — annars ser långsamma anrop (som AI-generering)
 * ut som att "inget händer" när man klickar.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-label={ariaLabel} className={`${className} disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
