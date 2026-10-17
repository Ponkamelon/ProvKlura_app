import type { CrosswordLayout } from "@/lib/nutid/layout";

export type GridCell = {
  row: number;
  col: number;
  /** Korrekt bokstav (används bara när showLetter avgör att den ska synas). */
  letter: string;
  number?: number;
  /** Index i entries för orden som går genom rutan. */
  entries: number[];
};

export function buildCells(layout: CrosswordLayout): Map<string, GridCell> {
  const cells = new Map<string, GridCell>();
  for (const p of layout.placements) {
    [...p.answer].forEach((letter, i) => {
      const row = p.dir === "down" ? p.row + i : p.row;
      const col = p.dir === "across" ? p.col + i : p.col;
      const k = `${row},${col}`;
      const cell = cells.get(k) ?? { row, col, letter, entries: [] };
      cell.entries.push(p.index);
      if (i === 0) cell.number = p.number;
      cells.set(k, cell);
    });
  }
  return cells;
}

/**
 * Själva rutnätet. Används både i elevens kryss (klickbart) och i
 * redaktörens förhandsvisning (med alla svar synliga).
 */
export function NutidGrid({
  layout,
  letterAt,
  activeEntry,
  solvedEntries,
  onCellClick,
  label,
}: {
  layout: CrosswordLayout;
  /** Vilken bokstav som ska synas i en ruta, eller "" för tom. */
  letterAt: (cell: GridCell) => string;
  activeEntry?: number | null;
  solvedEntries?: Set<number>;
  onCellClick?: (cell: GridCell) => void;
  label: string;
}) {
  const cells = buildCells(layout);

  return (
    <div
      className="nutid-grid mx-auto"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        maxWidth: `${layout.cols * 2.6}rem`,
      }}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: layout.rows * layout.cols }, (_, i) => {
        const row = Math.floor(i / layout.cols);
        const col = i % layout.cols;
        const cell = cells.get(`${row},${col}`);
        if (!cell) return <div key={i} aria-hidden="true" />;

        const isActive = activeEntry != null && cell.entries.includes(activeEntry);
        const isSolved = solvedEntries ? cell.entries.some((e) => solvedEntries.has(e)) : false;
        const letter = letterAt(cell);
        const className = `nutid-cell ${isActive ? "nutid-cell-active" : ""} ${isSolved ? "nutid-cell-solved" : ""}`;

        const content = (
          <>
            {cell.number && <span className="nutid-cell-number">{cell.number}</span>}
            <span>{letter}</span>
          </>
        );

        return onCellClick ? (
          <button key={i} type="button" tabIndex={-1} aria-hidden="true" className={className} onClick={() => onCellClick(cell)}>
            {content}
          </button>
        ) : (
          <div key={i} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
