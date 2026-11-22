export interface ExpansionOptionConfig {
  id: string;
  label: string;
  active: boolean;
}

export const EXPANSION_CONFIG: ExpansionOptionConfig[] = [
  { id: "dodge_city", label: "Dodge City (15 Heroes + Green Cards)", active: true },
  { id: "high_noon", label: "High Noon (13 Round Events)", active: false },
  { id: "fistful_of_cards", label: "A Fistful of Cards (15 Round Events)", active: false },
];

// Check expansion active status
export function isExpansionActive(packId: string): boolean {
  if (packId === "base") return true;
  return Boolean(EXPANSION_CONFIG.find((e) => e.id === packId)?.active);
}

// Keep base and active expansions
export function filterActiveExpansions(expansions?: string[] | null): string[] {
  const filtered = (expansions || []).filter((id) => isExpansionActive(id));
  return Array.from(new Set(["base", ...filtered]));
}
