"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

const TITLE = "ProvKlura – klura ut provet";
const MESSAGE =
  "Hej! Jag använder ProvKlura för att plugga inför prov. Den gör korta övningsfrågor av anteckningar och läroboken, för åk 7–9. Prova här:";

/**
 * "Tipsa om ProvKlura". På mobilen öppnas telefonens egen delningsmeny
 * (SMS, WhatsApp, mejl …). Där den saknas (oftast dator) visas i stället
 * ett färdigt mejl och en kopiera-länk-knapp. Ingen server behövs.
 */
export function ShareAppButton({
  variant = "button",
  label = "Tipsa en vän",
}: {
  variant?: "button" | "link";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function appUrl() {
    return typeof window === "undefined" ? "" : window.location.origin;
  }

  async function handleClick() {
    const url = appUrl();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: TITLE, text: MESSAGE, url });
        return;
      } catch (err) {
        // Användaren stängde menyn — gör ingenting.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Annat fel: falla tillbaka på mejl/kopiera nedan.
      }
    }
    setOpen((o) => !o);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(appUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(TITLE)}&body=${encodeURIComponent(
    `${MESSAGE}\n${appUrl()}`,
  )}`;

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={open}
        className={variant === "link" ? "link-back" : "btn-secondary"}
      >
        <Icon name="dela" size={variant === "link" ? 16 : 20} />
        {label}
      </button>

      {open && (
        <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="Tipsa om ProvKlura">
          <a href={mailto} className="btn-tertiary px-4 py-2 text-sm">
            <Icon name="skicka-inbjudan" size={18} />
            Skicka mejl
          </a>
          <button type="button" onClick={handleCopy} className="btn-secondary px-4 py-2 text-sm">
            <Icon name={copied ? "spara" : "dela"} size={18} />
            {copied ? "Länken är kopierad" : "Kopiera länk"}
          </button>
        </div>
      )}
    </div>
  );
}
