import { EngineCard } from "../types/cards";
import { EnginePlayer } from "../types/state";

// Normalize paired extra equipment names
export function normalizeEquipName(name: string): string {
  return name === "BINOCULARS" ? "BINOCULAR" : name;
}

// Collect unique equipped cards on player
export function getAllEquippedCards(player: EnginePlayer): EngineCard[] {
  const eq = player.equipments;
  if (!eq) return [];

  const seen = new Set<string>();
  const list: EngineCard[] = [];
  const pushUnique = (card?: EngineCard) => {
    if (!card || seen.has(card.id)) return;
    seen.add(card.id);
    list.push(card);
  };

  pushUnique(eq.weapon);
  pushUnique(eq.horseDef);
  pushUnique(eq.horseOff);
  pushUnique(eq.barrel);
  pushUnique(eq.extra);
  for (const item of eq.extras || []) {
    pushUnique(item);
  }
  return list;
}

// Check if card name is equipped
export function hasEquippedCardByName(
  player: EnginePlayer,
  cardName: string
): boolean {
  const normalized = normalizeEquipName(cardName);
  return getAllEquippedCards(player).some(
    (card) => normalizeEquipName(card.name) === normalized
  );
}

// Check whether player has a Barrel
export function hasBarrelCard(player: EnginePlayer): boolean {
  return (
    Boolean(player.equipments?.barrel) ||
    hasEquippedCardByName(player, "BARREL")
  );
}

// Remove equipped card by ID
export function removeEquippedCardById(
  player: EnginePlayer,
  targetCardId?: string
): EngineCard | null {
  const eq = player.equipments;
  if (!eq) return null;

  if (targetCardId !== undefined) {
    if (eq.weapon?.id === targetCardId) {
      const removed = eq.weapon;
      eq.weapon = undefined;
      return removed;
    }
    if (eq.horseDef?.id === targetCardId) {
      const removed = eq.horseDef;
      eq.horseDef = undefined;
      return removed;
    }
    if (eq.horseOff?.id === targetCardId) {
      const removed = eq.horseOff;
      eq.horseOff = undefined;
      return removed;
    }
    if (eq.barrel?.id === targetCardId) {
      const removed = eq.barrel;
      eq.barrel = undefined;
      return removed;
    }
    if (eq.extras && eq.extras.length > 0) {
      const extraIdx = eq.extras.findIndex((c) => c.id === targetCardId);
      if (extraIdx !== -1) {
        const removed = eq.extras.splice(extraIdx, 1)[0];
        eq.extra = eq.extras[0];
        return removed;
      }
    }
    if (eq.extra?.id === targetCardId) {
      const removed = eq.extra;
      eq.extra = eq.extras?.[0];
      return removed;
    }
    return null;
  }

  if (eq.weapon) {
    const removed = eq.weapon;
    eq.weapon = undefined;
    return removed;
  }
  if (eq.horseDef) {
    const removed = eq.horseDef;
    eq.horseDef = undefined;
    return removed;
  }
  if (eq.horseOff) {
    const removed = eq.horseOff;
    eq.horseOff = undefined;
    return removed;
  }
  if (eq.barrel) {
    const removed = eq.barrel;
    eq.barrel = undefined;
    return removed;
  }
  if (eq.extras && eq.extras.length > 0) {
    const removed = eq.extras.shift()!;
    eq.extra = eq.extras[0];
    return removed;
  }
  if (eq.extra) {
    const removed = eq.extra;
    eq.extra = undefined;
    return removed;
  }
  return null;
}
