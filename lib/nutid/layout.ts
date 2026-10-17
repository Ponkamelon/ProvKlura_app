/**
 * Nutidskrysset — lägger ut ord i ett korsord.
 *
 * Ren TypeScript utan beroenden: samma fil kopieras in i edge-funktionen
 * supabase/functions/nutidskryss-generate så att utkastet och appen
 * räknar på exakt samma sätt.
 */

export type Direction = "across" | "down";

export type Placement = {
  /** Index i entries-listan. */
  index: number;
  answer: string;
  row: number;
  col: number;
  dir: Direction;
  number: number;
};

export type CrosswordLayout = {
  rows: number;
  cols: number;
  placements: Placement[];
};

type Placed = { index: number; answer: string; row: number; col: number; dir: Direction };

const key = (r: number, c: number) => `${r},${c}`;

function cellsOf(p: { answer: string; row: number; col: number; dir: Direction }) {
  return [...p.answer].map((letter, i) => ({
    letter,
    row: p.dir === "down" ? p.row + i : p.row,
    col: p.dir === "across" ? p.col + i : p.col,
  }));
}

/** Kan ordet läggas här utan att krocka eller bilda ord som inte finns? */
function fits(
  grid: Map<string, string>,
  answer: string,
  row: number,
  col: number,
  dir: Direction,
): { ok: boolean; crossings: number } {
  const dr = dir === "down" ? 1 : 0;
  const dc = dir === "across" ? 1 : 0;

  // Rutan före och efter ordet måste vara tom.
  if (grid.has(key(row - dr, col - dc))) return { ok: false, crossings: 0 };
  if (grid.has(key(row + dr * answer.length, col + dc * answer.length))) return { ok: false, crossings: 0 };

  let crossings = 0;
  for (let i = 0; i < answer.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = grid.get(key(r, c));
    if (existing !== undefined) {
      if (existing !== answer[i]) return { ok: false, crossings: 0 };
      crossings++;
      continue;
    }
    // En tom ruta får inte ha grannar vid sidan av ordet — då skulle det
    // bildas tvåbokstavsord som ingen ledtråd finns till.
    if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) return { ok: false, crossings: 0 };
  }
  return { ok: crossings > 0, crossings };
}

function bounds(placed: Placed[]) {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const p of placed) {
    for (const cell of cellsOf(p)) {
      minR = Math.min(minR, cell.row);
      minC = Math.min(minC, cell.col);
      maxR = Math.max(maxR, cell.row);
      maxC = Math.max(maxC, cell.col);
    }
  }
  return { minR, minC, maxR, maxC };
}

function tryOrder(order: { index: number; answer: string }[]): Placed[] {
  const placed: Placed[] = [];
  const grid = new Map<string, string>();
  const put = (p: Placed) => {
    placed.push(p);
    for (const cell of cellsOf(p)) grid.set(key(cell.row, cell.col), cell.letter);
  };

  const [first, ...rest] = order;
  put({ ...first, row: 0, col: 0, dir: "across" });

  let pending = rest;
  // Flera varv: ett ord som inte fick plats först kan få plats när fler ord ligger ute.
  for (let round = 0; round < 3 && pending.length; round++) {
    const stillPending: typeof pending = [];
    for (const word of pending) {
      let best: { p: Placed; score: number } | null = null;
      for (const other of placed) {
        const dir: Direction = other.dir === "across" ? "down" : "across";
        const otherCells = cellsOf(other);
        for (let i = 0; i < word.answer.length; i++) {
          for (const cell of otherCells) {
            if (cell.letter !== word.answer[i]) continue;
            const row = dir === "down" ? cell.row - i : cell.row;
            const col = dir === "across" ? cell.col - i : cell.col;
            const check = fits(grid, word.answer, row, col, dir);
            if (!check.ok) continue;
            const candidate: Placed = { ...word, row, col, dir };
            const b = bounds([...placed, candidate]);
            const area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1);
            const width = b.maxC - b.minC + 1;
            // Fler korsningar är bättre, liten yta är bättre, och bredden
            // hålls nere så krysset får plats på en mobilskärm.
            const score = check.crossings * 100 - area - Math.max(0, width - 12) * 50;
            if (!best || score > best.score) best = { p: candidate, score };
          }
        }
      }
      if (best) put(best.p);
      else stillPending.push(word);
    }
    pending = stillPending;
  }
  return placed;
}

/**
 * Lägger ut så många ord som möjligt. Ord som inte går att korsa med
 * något annat utelämnas — anroparen ser det på placements.length.
 * Deterministisk: samma ord i samma ordning ger alltid samma kryss.
 */
export function layoutCrossword(answers: string[]): CrosswordLayout {
  const words = answers.map((answer, index) => ({ index, answer }));
  if (!words.length) return { rows: 0, cols: 0, placements: [] };

  const byLength = [...words].sort((a, b) => b.answer.length - a.answer.length || a.index - b.index);
  const orders = [byLength];
  // Prova också att börja med vart och ett av de längsta orden.
  for (let i = 1; i < Math.min(byLength.length, 4); i++) {
    orders.push([byLength[i], ...byLength.filter((_, j) => j !== i)]);
  }

  let best: Placed[] = [];
  let bestArea = Infinity;
  for (const order of orders) {
    const placed = tryOrder(order);
    const b = bounds(placed);
    const area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1);
    if (placed.length > best.length || (placed.length === best.length && area < bestArea)) {
      best = placed;
      bestArea = area;
    }
  }

  const b = bounds(best);
  const shifted = best.map((p) => ({ ...p, row: p.row - b.minR, col: p.col - b.minC }));

  // Numrering i läsordning; ett vågrätt och ett lodrätt ord som börjar i
  // samma ruta delar nummer, som i ett vanligt korsord.
  const starts = [...new Set(shifted.map((p) => key(p.row, p.col)))]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const numberAt = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]));

  const placements: Placement[] = shifted
    .map((p) => ({ ...p, number: numberAt.get(key(p.row, p.col)) ?? 0 }))
    .sort((x, y) => x.number - y.number || (x.dir === "across" ? -1 : 1));

  return {
    rows: b.maxR - b.minR + 1,
    cols: b.maxC - b.minC + 1,
    placements,
  };
}

/** Versaler, svenska bokstäver, inga mellanslag eller bindestreck. */
export function normalizeAnswer(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFC")
    .replace(/[^A-ZÅÄÖ]/g, "");
}
