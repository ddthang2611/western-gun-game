import type { Card, Character, Player } from "../../../types/game";
import { getAllEquipments } from "../../../utils/equipments";

export const DISCARD_COST_CARDS = new Set([
  "SPRINGFIELD",
  "WHISKY",
  "RAG TIME",
  "TEQUILA",
  "BRAWL",
]);

export const MANIPULATE_CARDS = new Set([
  "CAT BALOU",
  "CAN CAN",
  "PANIC!",
  "RAG TIME",
  "CONESTOGA",
]);

export const TARGETED_SINGLE_CARDS = new Set([
  "BANG!",
  "PUNCH",
  "SPRINGFIELD",
  "DUEL",
  "JAIL",
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
]);

export const TARGETED_GREEN_CARDS = new Set([
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
  "CAN CAN",
  "CONESTOGA",
]);

export const GREEN_DEFENSE_NAMES = new Set([
  "BIBLE",
  "SOMBRERO",
  "IRON PLATE",
  "TEN GALLON HAT",
]);

export const TARGETED_CARD_NAMES = new Set([
  "BANG!",
  "PUNCH",
  "SPRINGFIELD",
  "DUEL",
  "PANIC!",
  "CAT BALOU",
  "RAG TIME",
  "CONESTOGA",
  "CAN CAN",
  "JAIL",
  "TEQUILA",
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
]);

// Check BANG eligibility with Calamity Janet
export function isBangCardForHeroes(
  card: Card | undefined,
  heroes: Character[]
): boolean {
  if (!card) return false;
  if (card.name === "BANG!") return true;
  return (
    card.name === "MISSED!" &&
    heroes.some((h) => h.name === "Calamity Janet")
  );
}

// Count equipments, greens, and judgements
export function countInPlayCards(player: Player): number {
  const equipCount = getAllEquipments(player.equipments).length;
  const judgementCount =
    player.judgements && player.judgements.length > 0
      ? player.judgements.length
      : (player.hasJail ? 1 : 0) + (player.hasDynamite ? 1 : 0);
  return equipCount + player.greenCards.length + judgementCount;
}

// Count hand plus in-play cards
export function countInspectableCards(player: Player): number {
  return player.handCount + countInPlayCards(player);
}

// Check if target holds stealable cards
export function hasStealableCards(player: Player): boolean {
  return player.handCount > 0 || countInPlayCards(player) > 0;
}
