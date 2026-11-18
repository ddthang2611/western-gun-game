import { EnginePlayer, SimulationState } from "../types/state";
import { EngineCard } from "../types/cards";
import { DistanceCalculator } from "../board/distance_calculator";
import { SkillHooks } from "../interact/skill_hooks";
import { getAllEquippedCards } from "../utils/inventory";

export type TargetArea = "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";

export interface TargetValidationOptions {
  targetArea?: TargetArea;
  targetCardId?: string;
  requiresRange?: boolean;
  exactDistance?: number;
  allowSelf?: boolean;
  customWeaponRange?: number;
}

export interface TargetValidationResult {
  valid: boolean;
  reason?: string;
  target?: EnginePlayer;
}

const AREA_CARDS = new Set([
  "CAT BALOU",
  "PANIC!",
  "RAG TIME",
  "CAN CAN",
  "CONESTOGA",
  "RICOCHET",
]);

export class TargetValidator {
  // Validate target card presence in area
  private static validateTargetArea(
    targetPlayer: EnginePlayer,
    targetArea: TargetArea,
    targetCardId?: string
  ): TargetValidationResult {
    if (targetArea === "HAND") {
      if (targetPlayer.handCards.length === 0) {
        return { valid: false, reason: "Target player has no cards in hand." };
      }
      return { valid: true, target: targetPlayer };
    }

    if (targetArea === "EQUIPMENT") {
      const equipped = getAllEquippedCards(targetPlayer);
      if (equipped.length === 0) {
        return { valid: false, reason: "Target player has no equipment in play." };
      }
      if (targetCardId && !equipped.some((c) => c.id === targetCardId)) {
        return { valid: false, reason: "Target equipment card not found." };
      }
      return { valid: true, target: targetPlayer };
    }

    if (targetArea === "GREEN") {
      const greens = targetPlayer.greenCards || [];
      if (greens.length === 0) {
        return { valid: false, reason: "Target player has no green cards in play." };
      }
      if (
        targetCardId &&
        !greens.some((g) => g.id === targetCardId || g.card.id === targetCardId)
      ) {
        return { valid: false, reason: "Target green card not found." };
      }
      return { valid: true, target: targetPlayer };
    }

    if (targetArea === "JUDGEMENT") {
      const judgements = targetPlayer.judgements || [];
      if (judgements.length === 0) {
        return { valid: false, reason: "Target player has no judgement cards in play." };
      }
      if (
        targetCardId &&
        !judgements.some((j) => j.id === targetCardId || j.card.id === targetCardId)
      ) {
        return { valid: false, reason: "Target judgement card not found." };
      }
      return { valid: true, target: targetPlayer };
    }

    return { valid: false, reason: `Unsupported target area: ${targetArea}` };
  }

  // Validate card target (state signature)
  public static validate(
    state: SimulationState,
    card: EngineCard,
    fromPlayer: EnginePlayer,
    targetPlayer: EnginePlayer | undefined,
    options?: TargetValidationOptions
  ): TargetValidationResult;
  // Validate card target (card signature)
  public static validate(
    card: EngineCard,
    fromPlayer: EnginePlayer,
    targetPlayer: EnginePlayer | undefined,
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    options?: TargetValidationOptions
  ): TargetValidationResult;
  public static validate(
    arg1: SimulationState | EngineCard,
    arg2: EngineCard | EnginePlayer,
    arg3: EnginePlayer | undefined,
    arg4: EnginePlayer | SimulationState | Map<string, EnginePlayer> | undefined,
    arg5?: TargetValidationOptions
  ): TargetValidationResult {
    const isStateFirst = "players" in arg1 && "roomId" in arg1;

    const state: SimulationState | undefined = isStateFirst
      ? (arg1 as SimulationState)
      : arg4 && !(arg4 instanceof Map) && "players" in arg4
      ? (arg4 as SimulationState)
      : undefined;

    const players: Map<string, EnginePlayer> = isStateFirst
      ? (arg1 as SimulationState).players
      : arg4 instanceof Map
      ? arg4
      : (arg4 as SimulationState).players;

    const card = (isStateFirst ? arg2 : arg1) as EngineCard;
    const fromPlayer = (isStateFirst ? arg3 : arg2) as EnginePlayer;
    const targetPlayer = (isStateFirst ? arg4 : arg3) as EnginePlayer | undefined;
    const options = arg5;

    if (!targetPlayer) {
      return { valid: false, reason: "Target player is required." };
    }

    if (targetPlayer.isDead || (!targetPlayer.isGhost && targetPlayer.hp <= 0)) {
      return { valid: false, reason: "Target is dead" };
    }

    const isRicochetShot =
      card.name === "RICOCHET" ||
      (card.name === "BANG!" && Boolean(options?.targetArea && options.targetArea !== "HAND"));

    const selfAllowedByCard =
      card.name === "TEQUILA" ||
      card.name === "BEER" ||
      card.name === "WHISKY" ||
      card.name === "SALOON" ||
      card.name === "CANTEEN";
    const allowSelf = options?.allowSelf ?? selfAllowedByCard;

    if (!allowSelf && targetPlayer.id === fromPlayer.id) {
      return { valid: false, reason: `Cannot target yourself with ${card.name}.` };
    }

    if (card.name === "JAIL") {
      if (targetPlayer.isSheriff) {
        return { valid: false, reason: "Cannot put Sheriff in Jail." };
      }
      if (targetPlayer.judgements.some((j) => j.type === "JAIL")) {
        return { valid: false, reason: "Target player is already in Jail." };
      }
      return { valid: true, target: targetPlayer };
    }

    // Determine card distance constraints
    let requiresRange = options?.requiresRange;
    let exactDistance = options?.exactDistance;

    if (exactDistance === undefined && requiresRange === undefined) {
      if (
        card.name === "DERRINGER" ||
        card.name === "KNIFE" ||
        card.name === "PUNCH" ||
        card.name === "PANIC!"
      ) {
        exactDistance = 1;
      } else if (
        card.name === "PEPPERBOX" ||
        (card.name === "BANG!" && !isRicochetShot) ||
        (card.name === "MISSED!" && SkillHooks.hasSkill(fromPlayer, "Calamity Janet", state))
      ) {
        requiresRange = true;
      } else {
        requiresRange = false;
      }
    }

    const dist = state
      ? DistanceCalculator.calculateDistance(state, fromPlayer, targetPlayer)
      : DistanceCalculator.calculateDistance(players, fromPlayer.id, targetPlayer.id);

    if (exactDistance !== undefined) {
      if (dist !== exactDistance) {
        return {
          valid: false,
          reason: `${card.name} only reaches targets at distance ${exactDistance}. Current distance: ${dist}.`,
        };
      }
    } else if (requiresRange) {
      const range =
        options?.customWeaponRange ??
        (state
          ? DistanceCalculator.getAttackerWeaponRange(state, fromPlayer)
          : fromPlayer.equipments.weapon?.weaponRange ?? 1);
      if (dist > range) {
        return {
          valid: false,
          reason: `Target is out of range. Distance: ${dist}, Weapon Range: ${range}.`,
        };
      }
    }

    if (options?.targetArea && (AREA_CARDS.has(card.name) || isRicochetShot)) {
      return this.validateTargetArea(targetPlayer, options.targetArea, options.targetCardId);
    }

    return { valid: true, target: targetPlayer };
  }
}
