import { CardRegistry } from "../cards/card_registry";
import { EngineCard } from "../types/cards";
import { EngineCharacter, RoleType } from "../types/state";
import { SanitizedGameState, SanitizedPlayerState } from "../state/fog_of_war";
import { BotDecisionContext } from "./bot_types";
import {
  canUseBeerHeal,
  getAllInPlayCards,
  getEquippedBlueCards,
  getLivingContenders,
  getPlayerById,
  getWeaponRange,
  hasEquippedByName,
  hasSkill,
  isEquipmentEffective,
} from "./bot_state_utils";

interface RoleHeroWeights {
  sheriff: number;
  deputy: number;
  outlaw: number;
  renegade: number;
}

const HERO_ROLE_TABLE: Record<string, RoleHeroWeights> = {
  "bart cassidy": { sheriff: 94, deputy: 78, outlaw: 72, renegade: 84 },
  "el gringo": { sheriff: 88, deputy: 76, outlaw: 78, renegade: 86 },
  "jourdonnais": { sheriff: 95, deputy: 82, outlaw: 74, renegade: 88 },
  "paul regret": { sheriff: 92, deputy: 84, outlaw: 80, renegade: 94 },
  "lucky duke": { sheriff: 86, deputy: 76, outlaw: 74, renegade: 84 },
  "sid ketchum": { sheriff: 90, deputy: 80, outlaw: 76, renegade: 95 },
  "willy the kid": { sheriff: 74, deputy: 82, outlaw: 95, renegade: 84 },
  "slab the killer": { sheriff: 78, deputy: 84, outlaw: 94, renegade: 86 },
  "suzy lafayette": { sheriff: 84, deputy: 86, outlaw: 88, renegade: 90 },
  "calamity janet": { sheriff: 86, deputy: 84, outlaw: 86, renegade: 90 },
  "kit carlson": { sheriff: 84, deputy: 84, outlaw: 82, renegade: 88 },
  "jesse jones": { sheriff: 82, deputy: 80, outlaw: 86, renegade: 84 },
  "pedro ramirez": { sheriff: 80, deputy: 78, outlaw: 80, renegade: 82 },
  "black jack": { sheriff: 82, deputy: 82, outlaw: 84, renegade: 84 },
  "rose doolan": { sheriff: 78, deputy: 82, outlaw: 88, renegade: 82 },
  "vulture sam": { sheriff: 76, deputy: 72, outlaw: 82, renegade: 92 },
  "apache kid": { sheriff: 78, deputy: 78, outlaw: 80, renegade: 84 },
  "belle star": { sheriff: 76, deputy: 84, outlaw: 92, renegade: 86 },
  "bill noface": { sheriff: 90, deputy: 84, outlaw: 86, renegade: 92 },
  "chuck wengam": { sheriff: 88, deputy: 86, outlaw: 90, renegade: 92 },
  "doc holyday": { sheriff: 78, deputy: 82, outlaw: 90, renegade: 84 },
  "elena fuente": { sheriff: 86, deputy: 84, outlaw: 80, renegade: 92 },
  "greg digger": { sheriff: 80, deputy: 76, outlaw: 78, renegade: 90 },
  "herb hunter": { sheriff: 82, deputy: 76, outlaw: 80, renegade: 90 },
  "jose delgado": { sheriff: 84, deputy: 82, outlaw: 84, renegade: 86 },
  "molly stark": { sheriff: 86, deputy: 82, outlaw: 80, renegade: 88 },
  "pat brennan": { sheriff: 80, deputy: 82, outlaw: 84, renegade: 82 },
  "pixie pete": { sheriff: 74, deputy: 80, outlaw: 84, renegade: 82 },
  "sean mallory": { sheriff: 72, deputy: 72, outlaw: 70, renegade: 78 },
  "tequila joe": { sheriff: 90, deputy: 84, outlaw: 78, renegade: 92 },
  "vera custer": { sheriff: 80, deputy: 82, outlaw: 84, renegade: 88 },
};

function norm(name: string): string {
  const u = (name || "").trim().toUpperCase();
  return u === "BINOCULARS" ? "BINOCULAR" : u;
}

// Score character candidate for role selection
export function evaluateCharacterForRole(
  char: EngineCharacter,
  role: RoleType,
  is3PlayerVariant: boolean
): number {
  const key = (char.name || "").trim().toLowerCase();
  const table = HERO_ROLE_TABLE[key];
  let score = table ? table[role] : 72;
  if (is3PlayerVariant) {
    // 3P Quarry favors burst and sustainability
    score = (table ? table.outlaw * 0.55 + table.renegade * 0.45 : 74);
  }
  score += (char.baseHp || 4) * 3.5;
  return score;
}

// Score contextual keep value K(c) in [0, 100]
export function evaluateKeepValue(
  card: EngineCard,
  ctx: BotDecisionContext
): number {
  const { snapshot, me, hand, myRole } = ctx;
  const name = norm(card.name);
  const living = getLivingContenders(snapshot).length;
  const hpRatio = me.maxHp > 0 ? me.hp / me.maxHp : 0.5;
  const lowHp = me.hp <= 2;
  const criticalHp = me.hp <= 1;

  const isCalamity = hasSkill(me, "Calamity Janet", snapshot);
  const isWilly = hasSkill(me, "Willy the Kid", snapshot);
  const isTequilaJoe = hasSkill(me, "Tequila Joe", snapshot);
  const isJose = hasSkill(me, "Jose Delgado", snapshot);
  const isElena = hasSkill(me, "Elena Fuente", snapshot);
  const hasVolcanic = norm(me.equipments?.weapon?.name || "") === "VOLCANIC";
  const hasBarrel = Boolean(me.equipments?.barrel);

  const missedCount = hand.filter((c) => {
    const n = norm(c.name);
    return n === "MISSED!" || n === "DODGE";
  }).length;

  // Immediate card draw engines
  if (name === "WELLS FARGO") return 92;
  if (name === "STAGECOACH") return 86;
  if (name === "PONY EXPRESS") return 80;
  if (name === "GENERAL STORE") return 54;

  // Defense cards
  if (name === "DODGE") {
    let v = 76 + (lowHp ? 14 : 0) + (criticalHp ? 8 : 0) - Math.max(0, missedCount - 2) * 8;
    return clamp(v, 35, 98);
  }
  if (name === "MISSED!") {
    let v = 64 + (lowHp ? 16 : 0) + (criticalHp ? 10 : 0) - (hasBarrel ? 6 : 0);
    if (isCalamity) v += 10;
    v -= Math.max(0, missedCount - 2) * 10;
    return clamp(v, 28, 95);
  }
  if (name === "BIBLE") return clamp(78 + (lowHp ? 12 : 0), 40, 95);
  if (name === "SOMBRERO" || name === "IRON PLATE" || name === "TEN GALLON HAT") {
    const dup = (me.greenCards || []).some((g) => norm(g.card.name) === name);
    return dup ? 22 : clamp(68 + (lowHp ? 12 : 0), 35, 88);
  }

  // Healing cards
  if (name === "BEER") {
    if (!canUseBeerHeal(snapshot)) return isElena ? 38 : 16;
    let v = 62 + (lowHp ? 24 : 0) + (criticalHp ? 12 : 0) + (isTequilaJoe ? 10 : 0);
    if (myRole === "renegade" || myRole === "sheriff") v += 6;
    return clamp(v, 20, 99);
  }
  if (name === "WHISKY") {
    let v = 58 + (lowHp ? 22 : 0) + (hpRatio <= 0.5 ? 10 : 0);
    if (hand.length <= 1) v -= 20;
    return clamp(v, 22, 92);
  }
  if (name === "TEQUILA") {
    let v = 52 + (lowHp ? 16 : 0) + (myRole === "deputy" ? 14 : 0);
    if (hand.length <= 1) v -= 18;
    return clamp(v, 20, 86);
  }
  if (name === "SALOON") {
    let v = 50 + (lowHp ? 14 : 0) + (myRole === "deputy" ? 10 : 0);
    if (living === 2) v -= 18;
    return clamp(v, 20, 82);
  }
  if (name === "CANTEEN") {
    const dup = (me.greenCards || []).some((g) => norm(g.card.name) === "CANTEEN");
    return dup ? 20 : clamp(64 + (lowHp ? 16 : 0), 30, 86);
  }

  // Control and manipulation
  if (name === "PANIC!") return 78;
  if (name === "CAT BALOU") return 76;
  if (name === "RAG TIME") return hand.length >= 2 ? 70 : 40;
  if (name === "CAN CAN" || name === "CONESTOGA") {
    const dup = (me.greenCards || []).some((g) => norm(g.card.name) === name);
    return dup ? 22 : 72;
  }
  if (name === "JAIL") return living > 2 ? 76 : 68;
  if (name === "DYNAMITE") {
    if (hasSkill(me, "Lucky Duke", snapshot)) return 52;
    return 24;
  }

  // Offensive cards
  if (name === "BANG!") {
    let v = 58;
    if (isWilly || hasVolcanic) v += 18;
    if (isCalamity) v += 12;
    if (myRole === "outlaw") v += 6;
    const bangCount = hand.filter((c) => norm(c.name) === "BANG!").length;
    if (!isWilly && !hasVolcanic && bangCount >= 3) v -= 12;
    return clamp(v, 30, 88);
  }
  if (name === "GATLING") return 76;
  if (name === "INDIANS!") return 74;
  if (name === "DUEL") return 66 + (myRole === "outlaw" ? 6 : 0);
  if (name === "PUNCH") return 64;
  if (name === "SPRINGFIELD") return hand.length >= 2 ? 62 : 34;
  if (name === "BRAWL") return living >= 3 && hand.length >= 2 ? 64 : 28;
  if (
    name === "BUFFALO RIFLE" ||
    name === "PEPPERBOX" ||
    name === "DERRINGER" ||
    name === "KNIFE" ||
    name === "HOWITZER"
  ) {
    const dup = (me.greenCards || []).some((g) => norm(g.card.name) === name);
    return dup ? 20 : 66;
  }

  // Blue passive equipment
  if (name === "BARREL") {
    if (hasEquippedByName(me, "BARREL")) return isJose ? 50 : 18;
    return 84 + (lowHp ? 8 : 0);
  }
  if (name === "MUSTANG" || name === "HIDEOUT") {
    if (hasEquippedByName(me, name)) return isJose ? 48 : 18;
    return 78 + (lowHp ? 8 : 0);
  }
  if (name === "SCOPE" || name === "BINOCULAR") {
    if (hasEquippedByName(me, name)) return isJose ? 48 : 18;
    return 74;
  }

  // Blue weapons
  const def = CardRegistry.get(card);
  if (def?.slotKey === "weapon" || card.weaponRange) {
    if (name === "VOLCANIC") {
      if (hasVolcanic) return isJose ? 48 : 18;
      return 74;
    }
    const curRange = getWeaponRange(snapshot, me);
    const newRange = card.weaponRange ?? def?.weaponRange ?? 1;
    if (norm(me.equipments?.weapon?.name || "") === name) {
      return isJose ? 48 : 16;
    }
    if (newRange > curRange) return 58 + newRange * 5;
    return isJose ? 46 : 22;
  }

  return 45;
}

// Score in-play card value for steal/destroy selection
export function evaluateInPlayCardValue(
  card: EngineCard,
  area: "EQUIPMENT" | "GREEN" | "JUDGEMENT",
  owner: SanitizedPlayerState,
  isEnemy: boolean
): number {
  const name = norm(card.name);

  if (area === "JUDGEMENT") {
    if (name === "JAIL") {
      // Never free an enemy; high value to free an ally
      return isEnemy ? -120 : 95;
    }
    if (name === "DYNAMITE") {
      // Saving ally from Dynamite is critical; removing enemy Dynamite is bad
      return isEnemy ? -45 : 105;
    }
    return isEnemy ? 10 : 40;
  }

  if (!isEnemy) {
    // Do not strip allies of helpful equipment or green cards
    return -70;
  }

  if (area === "EQUIPMENT") {
    if (name === "BARREL") return 92;
    if (name === "MUSTANG") return 86;
    if (name === "HIDEOUT") return 84;
    if (name === "VOLCANIC") return owner.handCount >= 2 ? 94 : 74;
    if (name === "SCOPE" || name === "BINOCULAR") return 76;
    if (card.weaponRange) return 56 + card.weaponRange * 7;
    return 60;
  }

  // Green cards in front of enemy
  if (name === "PONY EXPRESS") return 88;
  if (name === "BIBLE") return 84;
  if (name === "HOWITZER" || name === "BUFFALO RIFLE") return 82;
  if (name === "CONESTOGA" || name === "CAN CAN") return 78;
  if (name === "SOMBRERO" || name === "IRON PLATE" || name === "TEN GALLON HAT") return 72;
  if (name === "CANTEEN") return owner.hp <= 2 ? 78 : 62;
  return 66;
}

// Estimate target defensive capacity E_def(i)
export function estimateTargetDefense(
  target: SanitizedPlayerState,
  snapshot: SanitizedGameState
): number {
  const turnPlayer = getPlayerById(snapshot, snapshot.turnPlayerId);
  const equipEffective = isEquipmentEffective(target, turnPlayer, snapshot);
  let def = 0;

  if (equipEffective && Boolean(target.equipments?.barrel)) {
    def += 0.25;
  }
  if (hasSkill(target, "Jourdonnais", snapshot)) {
    def += 0.25;
  }
  if (equipEffective) {
    const readyGreenDef = (target.greenCards || []).filter(
      (g) => !g.isDelay && CardRegistry.isGreenDefenseCard(g.card)
    ).length;
    def += readyGreenDef * 0.9;
  }

  const perCardRate = hasSkill(target, "Elena Fuente", snapshot)
    ? 0.85
    : hasSkill(target, "Calamity Janet", snapshot)
    ? 0.48
    : 0.3;
  def += Math.min(target.handCount, 6) * perCardRate;
  return def;
}

// Count defensive in-play cards on player
export function countTargetInPlayCount(target: SanitizedPlayerState): number {
  return getAllInPlayCards(target).length;
}

// Evaluate blue card discard cost for Jose Delgado
export function evaluateBlueCardForJose(
  card: EngineCard,
  ctx: BotDecisionContext
): number {
  const { me, snapshot } = ctx;
  const name = norm(card.name);
  if (hasEquippedByName(me, name)) return 10;
  const def = CardRegistry.get(card);
  if (def?.slotKey === "weapon" || card.weaponRange) {
    const cur = getWeaponRange(snapshot, me);
    const next = card.weaponRange ?? def?.weaponRange ?? 1;
    if (name !== "VOLCANIC" && next <= cur) return 14;
  }
  if (name === "DYNAMITE") return 12;
  return evaluateKeepValue(card, ctx);
}

// Check if equipped blue cards include any item
export function hasAnyBlueEquipment(player: SanitizedPlayerState): boolean {
  return getEquippedBlueCards(player).length > 0;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
