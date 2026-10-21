import type { ReactNode } from "react";

// ProvKluras ikonset — se designprofilen (Ikoner, del C).
// 24×24, linje 2, rundade ändar. Färgen ärvs från texten (currentColor).
const PATHS = {
  "anpassningar": (
    <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>
  ),
  "avbryt": (
    <><path d="M6 6l12 12M18 6L6 18" /></>
  ),
  "dela": (
    <><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></>
  ),
  "dra-tillbaka": (
    <><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></>
  ),
  "elever": (
    <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14a4.5 4.5 0 0 1 4.5 5" /></>
  ),
  "formulera-om": (
    <><path d="M20 11A8 8 0 0 0 5.7 6.1L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></>
  ),
  "generera-fragor": (
    <><path d="M10 3.5l1.7 4.3 4.3 1.7-4.3 1.7L10 15.5l-1.7-4.3L4 9.5l4.3-1.7z" /><path d="M18 14v6M15 17h6" /></>
  ),
  "godkann-alla": (
    <><path d="M2.5 12.5l4.5 4.5 8-8.5M11.5 15.5l1.5 1.5 8.5-9" /></>
  ),
  "hem": (
    <><path d="M4 11.5L12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" /></>
  ),
  "hoppa-over": (
    <><path d="M5 5.5l9 6.5-9 6.5z M19 5v14" /></>
  ),
  "ideverkstad": (
    <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></>
  ),
  "installningar": (
    <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="6.5" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>
  ),
  "jag-fastnar": (
    <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>
  ),
  "klar-for-idag": (
    <><path d="M5 21V4M5 4h12l-2.5 4L17 12H5" /></>
  ),
  "lagg-till": (
    <><path d="M12 5v14M5 12h14" /></>
  ),
  "lagg-till-elev": (
    <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6" /></>
  ),
  "logga-in": (
    <><path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>
  ),
  "logga-ut": (
    <><path d="M15 17l5-5-5-5M20 12H9M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /></>
  ),
  "nasta": (
    <><path d="M5 12h14M13 6l6 6-6 6" /></>
  ),
  "nationellt-prov": (
    <><circle cx="12" cy="9" r="5.5" /><path d="M9 14l-1.5 7 4.5-2.5 4.5 2.5-1.5-7" /></>
  ),
  "nutidskryss": (
    <><path d="M4 5h13v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2zM17 9h3v9a2 2 0 0 1-2 2M7 9h7M7 13h7M7 16h4" /></>
  ),
  "pausa": (
    <><path d="M9 5v14M15 5v14" /></>
  ),
  "pluggprojekt": (
    <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>
  ),
  "publicera": (
    <><path d="M12 15V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>
  ),
  "redigera": (
    <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14.5 7.5l2 2" /></>
  ),
  "skicka-inbjudan": (
    <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>
  ),
  "skrivklura": (
    <><path d="M14.5 4.5l5 5L9 20H4v-5z M12.5 6.5l5 5" /><path d="M15 20h5" /></>
  ),
  "spara": (
    <><path d="M5 12.5l4.5 4.5L19 7.5" /></>
  ),
  "statistik": (
    <><path d="M4 20h16M7 16v-5M12 16V6M17 16V9" /></>
  ),
  "ta-bort": (
    <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>
  ),
  "testbibliotek": (
    <><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="M15 6.5l3.5-.9 2.7 13.1-3.5.9z" /></>
  ),
  "tillbaka": (
    <><path d="M19 12H5M11 6l-6 6 6 6" /></>
  ),
  "trana-fel": (
    <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>
  ),
  "vanliga-fragor": (
    <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.3v.2" /></>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  /** Sätt bara när ikonen står ensam — annars döljs den för skärmläsare. */
  label?: string;
};

export function Icon({ name, size = 20, className = "", label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["shrink-0", className].filter(Boolean).join(" ")}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
