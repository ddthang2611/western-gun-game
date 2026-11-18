import type { Card, EquipmentSlot } from "../types/game";

// Deduplicate extra equipment slots
export function getExtraEquipments(eq?: EquipmentSlot | null): Card[] {
  if (!eq) return [];
  const result: Card[] = [];
  const seen = new Set<string>();

  if (Array.isArray(eq.extras)) {
    for (const card of eq.extras) {
      if (card && !seen.has(card.id)) {
        seen.add(card.id);
        result.push(card);
      }
    }
  }

  if (eq.extra && !seen.has(eq.extra.id)) {
    result.push(eq.extra);
  }

  return result;
}

// Collect all equipped blue cards
export function getAllEquipments(eq?: EquipmentSlot | null): Card[] {
  if (!eq) return [];
  return [
    eq.weapon,
    eq.horseDef,
    eq.horseOff,
    eq.barrel,
    ...getExtraEquipments(eq),
  ].filter((c): c is Card => Boolean(c));
}
