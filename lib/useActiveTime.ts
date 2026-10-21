"use client";

import { useEffect, useRef } from "react";

const TICK_MS = 5000;
/** Utan klick, tangenttryck eller scroll på två minuter räknas tiden inte. */
const IDLE_MS = 120_000;

/**
 * Räknar aktiv tid på sidan: bara när fliken syns och eleven nyligen gjort
 * något. take() lämnar sekunderna sedan förra anropet och nollställer.
 */
export function useActiveTime() {
  const seconds = useRef(0);
  const lastInput = useRef(Date.now());

  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "input", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput.current < IDLE_MS) {
        seconds.current += TICK_MS / 1000;
      }
    }, TICK_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(timer);
    };
  }, []);

  return {
    take(): number {
      const s = seconds.current;
      seconds.current = 0;
      return s;
    },
    /** Lägg tillbaka tid som inte gick att spara, så den följer med nästa gång. */
    giveBack(s: number) {
      seconds.current += s;
    },
  };
}
