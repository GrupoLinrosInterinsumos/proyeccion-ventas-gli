export const REGIONS = ["LIMA", "AREQUIPA", "TRUJILLO"] as const;
export type Region = (typeof REGIONS)[number];

export function isRegion(value: string | null | undefined): value is Region {
  return !!value && (REGIONS as readonly string[]).includes(value);
}

export const REGION_LABELS: Record<Region, string> = {
  LIMA: "Lima",
  AREQUIPA: "Arequipa",
  TRUJILLO: "Trujillo",
};
