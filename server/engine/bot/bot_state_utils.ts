import { CardRegistry } from "../cards/card_registry";
import { EngineCard, Suit } from "../types/cards";
import { PlayerCommand } from "../types/actions";
import { SanitizedGameState, SanitizedPlayerState } from "../state/fog_of_war";
import { InPlayCardEntry } from "./bot_types";

export interface DistanceOverride {
  addedAttackerEquip?: EngineCard;
  removedDefenderCardId?: string;
}

function normalizeName(name: string): string {
  const upper = (name || "").trim().toUpperCase();
  if (upper === "BINOCULARS") return "BINOCULAR";
  return upper;
}

// Find player in sanitized snapshot
export function getPlayerById(
  snapshot: SanitizedGameState,
  playerId: string | undefined
): SanitizedPlayerState | undefined {
  if (!playerId) return undefined;
  return snapshot.players.find((p) => p.id === playerId);
}

// Get living players sorted by seat
export function getAlivePlayers(
  snapshot: SanitizedGameState,
  includeGhosts: boolean = true
): SanitizedPlayerState[] {
  return snapshot.players
    .filter((p) => !p.isDead && (includeGhosts ? p.hp > 0 || p.isGhost : !p.isGhost && p.hp > 0))
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

// Get non-ghost living contenders
export function getLivingContenders(
  snapshot: SanitizedGameState
): SanitizedPlayerState[] {
  return getAlivePlayers(snapshot, false);
}

// Check character skill with hangover guard
export function hasSkill(
  player: SanitizedPlayerState | undefined,
  skillName: string,
  snapshot: SanitizedGameState
): boolean {
  if (!player) return false;
  if (snapshot.activeEvent?.effectCode === "EVENT_HN_HANGOVER") return false;
  const target = skillName.trim().toLowerCase();
  const hasBase = (player.characters || []).some(
    (c) => c.name.trim().toLowerCase() === target
  );
  if (hasBase) return true;
  if (player.copiedCharacter?.name.trim().toLowerCase() === target) return true;
  return false;
}

// Check equipment active status
export function isEquipmentEffective(
  target: SanitizedPlayerState,
  turnPlayer: SanitizedPlayerState | undefined,
  snapshot: SanitizedGameState
): boolean {
  if (snapshot.activeEvent?.effectCode === "EVENT_FOC_LASSO") return false;
  if (
    turnPlayer &&
    turnPlayer.id !== target.id &&
    hasSkill(turnPlayer, "Belle Star", snapshot)
  ) {
    return false;
  }
  return true;
}

// Resolve card suit under active event
export function getEffectiveSuit(
  card: EngineCard,
  snapshot: SanitizedGameState
): Suit {
  const code = snapshot.activeEvent?.effectCode;
  if (code === "EVENT_HN_BLESSING") return "hearts";
  if (code === "EVENT_HN_CURSE") return "spades";
  return card.suit;
}

// Check Apache Kid diamond immunity
export function isImmuneToCard(
  target: SanitizedPlayerState,
  card: EngineCard,
  attacker: SanitizedPlayerState,
  snapshot: SanitizedGameState
): boolean {
  if (target.id === attacker.id) return false;
  if (!hasSkill(target, "Apache Kid", snapshot)) return false;
  return getEffectiveSuit(card, snapshot) === "diamonds";
}

// List all equipped blue cards
export function getEquippedBlueCards(player: SanitizedPlayerState): EngineCard[] {
  const eq = player.equipments || {};
  const list: EngineCard[] = [];
  if (eq.weapon) list.push(eq.weapon);
  if (eq.horseDef) list.push(eq.horseDef);
  if (eq.horseOff) list.push(eq.horseOff);
  if (eq.barrel) list.push(eq.barrel);
  if (eq.extra) list.push(eq.extra);
  if (Array.isArray(eq.extras)) {
    for (const c of eq.extras) {
      if (c && !list.some((x) => x.id === c.id)) list.push(c);
    }
  }
  return list;
}

// Check duplicate equipped card name
export function hasEquippedByName(
  player: SanitizedPlayerState,
  cardName: string
): boolean {
  const target = normalizeName(cardName);
  return getEquippedBlueCards(player).some((c) => normalizeName(c.name) === target);
}

// List all cards in front of player
export function getAllInPlayCards(player: SanitizedPlayerState): InPlayCardEntry[] {
  const entries: InPlayCardEntry[] = [];
  for (const card of getEquippedBlueCards(player)) {
    entries.push({ area: "EQUIPMENT", card });
  }
  for (const g of player.greenCards || []) {
    entries.push({
      area: "GREEN",
      card: g.card,
      isDelay: g.isDelay,
      greenEntryId: g.id,
    });
  }
  for (const j of player.judgements || []) {
    entries.push({ area: "JUDGEMENT", card: j.card });
  }
  return entries;
}

// Calculate distance with optional hypothetical overrides
export function calculateDistance(
  snapshot: SanitizedGameState,
  attacker: SanitizedPlayerState,
  defender: SanitizedPlayerState,
  override?: DistanceOverride
): number {
  if (attacker.id === defender.id) return 0;
  const alive = getAlivePlayers(snapshot, true);
  const fromIdx = alive.findIndex((p) => p.id === attacker.id);
  const toIdx = alive.findIndex((p) => p.id === defender.id);
  if (fromIdx === -1 || toIdx === -1) return Infinity;

  const isAmbush = snapshot.activeEvent?.effectCode === "EVENT_FOC_AMBUSH";
  const count = alive.length;
  const diff = Math.abs(fromIdx - toIdx);
  const baseDistance = isAmbush ? 1 : Math.min(diff, count - diff);
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);

  let defMod = 0;
  if (isEquipmentEffective(defender, turnPlayer, snapshot)) {
    const defCards = getEquippedBlueCards(defender).filter(
      (c) => c.id !== override?.removedDefenderCardId
    );
    const hasMustang = defCards.some((c) => normalizeName(c.name) === "MUSTANG");
    const hasHideout = defCards.some((c) => normalizeName(c.name) === "HIDEOUT");
    if (hasMustang) defMod += 1;
    if (hasHideout) defMod += 1;
  }
  if (!isAmbush && hasSkill(defender, "Paul Regret", snapshot)) {
    defMod += 1;
  }

  let offMod = 0;
  if (isEquipmentEffective(attacker, turnPlayer, snapshot)) {
    const offCards = [...getEquippedBlueCards(attacker)];
    if (override?.addedAttackerEquip) {
      offCards.push(override.addedAttackerEquip);
    }
    const hasScope = offCards.some((c) => normalizeName(c.name) === "SCOPE");
    const hasBinocular = offCards.some((c) => normalizeName(c.name) === "BINOCULAR");
    if (hasScope) offMod += 1;
    if (hasBinocular) offMod += 1;
  }
  if (!isAmbush && hasSkill(attacker, "Rose Doolan", snapshot)) {
    offMod += 1;
  }

  return Math.max(1, baseDistance + defMod - offMod);
}

// Get effective attacker weapon range
export function getWeaponRange(
  snapshot: SanitizedGameState,
  attacker: SanitizedPlayerState,
  overrideWeapon?: EngineCard
): number {
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
  const weapon = overrideWeapon ?? attacker.equipments?.weapon;
  if (weapon && isEquipmentEffective(attacker, turnPlayer, snapshot)) {
    return weapon.weaponRange || 1;
  }
  return 1;
}

// Get allowed BANG! count per turn
export function getBangLimit(
  snapshot: SanitizedGameState,
  player: SanitizedPlayerState
): number {
  const code = snapshot.activeEvent?.effectCode;
  if (code === "EVENT_HN_THE_SERMON" && snapshot.turnPlayerId === player.id) {
    return 0;
  }
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
  const hasVolcanic =
    normalizeName(player.equipments?.weapon?.name || "") === "VOLCANIC" &&
    isEquipmentEffective(player, turnPlayer, snapshot);
  let baseLimit = hasVolcanic || hasSkill(player, "Willy the Kid", snapshot) ? Infinity : 1;
  if (code === "EVENT_HN_SHOOTOUT") {
    baseLimit = Math.max(baseLimit, 2);
  }
  return baseLimit;
}

// Check if active event blocks playing card
export function isCardBlockedByEvent(
  snapshot: SanitizedGameState,
  player: SanitizedPlayerState,
  card: EngineCard
): boolean {
  const code = snapshot.activeEvent?.effectCode;
  const name = normalizeName(card.name);
  if (code === "EVENT_HN_THE_SERMON" && snapshot.turnPlayerId === player.id) {
    if (name === "BANG!") return true;
    if (name === "MISSED!" && hasSkill(player, "Calamity Janet", snapshot)) return true;
  }
  if (code === "EVENT_HN_THE_REVEREND" && name === "BEER") {
    return true;
  }
  if (code === "EVENT_FOC_THE_JUDGE") {
    const def = CardRegistry.get(card);
    const isInPlay = def
      ? CardRegistry.isEquippableCard(card)
      : card.border === "blue" || card.border === "green";
    if (isInPlay) return true;
  }
  return false;
}

// Check if Beer heal is permitted
export function canUseBeerHeal(snapshot: SanitizedGameState): boolean {
  if (snapshot.activeEvent?.effectCode === "EVENT_HN_THE_REVEREND") return false;
  return getLivingContenders(snapshot).length > 2;
}

// Check if card can act as Missed!
export function isHandMissedCard(
  card: EngineCard,
  player: SanitizedPlayerState,
  snapshot: SanitizedGameState,
  reactionType: string
): boolean {
  const name = normalizeName(card.name);
  if (name === "MISSED!") return true;
  if (name === "DODGE" && reactionType !== "EVENT_RUSSIAN_ROULETTE") return true;
  if (
    name === "BANG!" &&
    reactionType !== "EVENT_RUSSIAN_ROULETTE" &&
    hasSkill(player, "Calamity Janet", snapshot)
  ) {
    return true;
  }
  if (
    reactionType !== "EVENT_RUSSIAN_ROULETTE" &&
    hasSkill(player, "Elena Fuente", snapshot)
  ) {
    return true;
  }
  return false;
}

// Check if card can act as BANG! in reaction
export function isHandBangCard(
  card: EngineCard,
  player: SanitizedPlayerState,
  snapshot: SanitizedGameState
): boolean {
  const name = normalizeName(card.name);
  if (name === "BANG!") return true;
  if (name === "MISSED!" && hasSkill(player, "Calamity Janet", snapshot)) {
    return true;
  }
  return false;
}

// Build stable deduplication signature for command
export function buildCommandSignature(cmd: PlayerCommand): string {
  const discards = (cmd.discardCardIds || []).join(",");
  const chars = (cmd.characterIds || []).join(",");
  const action = cmd.payload?.action ?? cmd.payload?.choice ?? cmd.payload?.skillType ?? "";
  return [
    cmd.type,
    cmd.cardId ?? "",
    cmd.greenCardId ?? "",
    cmd.targetPlayerId ?? "",
    cmd.targetArea ?? "",
    cmd.targetCardId ?? "",
    discards,
    chars,
    String(action),
  ].join("|");
}
