"use client";

export type SortDir = "asc" | "desc";

/** Column-header button: click to sort by that column, click again to flip the direction. */
export default function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={active ? (dir === "desc" ? "Mayor a menor" : "Menor a mayor") : "Ordenar"}
      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-primary ${
        active ? "text-primary" : ""
      }`}
    >
      {label}
      <span aria-hidden className={active ? "" : "opacity-40"}>
        {active ? (dir === "desc" ? "▼" : "▲") : "↕"}
      </span>
    </button>
  );
}

/** Next sort state when a column header is clicked: new column → desc first, same column → flip. */
export function nextSort<K extends string>(
  current: { key: K; dir: SortDir } | null,
  key: K
): { key: K; dir: SortDir } {
  if (current && current.key === key) return { key, dir: current.dir === "desc" ? "asc" : "desc" };
  return { key, dir: "desc" };
}
