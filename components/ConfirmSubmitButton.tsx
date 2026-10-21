"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit-knapp som frågar "Är du säker?" innan formuläret skickas.
 * Används för sådant som inte går att ångra, t.ex. att ta bort ett
 * pluggprojekt — så att ett felklick inte raderar något direkt.
 */
export function ConfirmSubmitButton({
  children,
  message,
  pendingText,
  className,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  message: string;
  pendingText?: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={ariaLabel}
      className={`${className ?? ""} disabled:opacity-60`}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
