/**
 * Rättning av skrivna svar. Text jämförs utan skillnad på stora och små
 * bokstäver. Tal jämförs som tal: decimalkomma och punkt godkänns båda,
 * mellanslag i stora tal ignoreras och likvärdiga svar (0,5 och 0,50,
 * 12 000 och 12000) räknas som samma svar.
 */
const SPACES = /[\s   ]/g;

export function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(SPACES, "").replace(",", ".").replace(/^−/, "-");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function answerMatches(given: string, accepted: string[]): boolean {
  const text = given.trim().toLowerCase();
  if (accepted.some((a) => a.trim().toLowerCase() === text)) return true;
  const n = parseNumber(given);
  if (n === null) return false;
  return accepted.some((a) => {
    const m = parseNumber(a);
    return m !== null && Math.abs(m - n) < 1e-9;
  });
}
