import { EnginePlayer, SimulationState } from "../types/state";
import { SeatManager } from "./seat_manager";
import { SkillHooks } from "../interact/skill_hooks";
import { getAllEquippedCards, normalizeEquipName } from "../utils/inventory";

export class DistanceCalculator {
  // Resolve distance between two players
  public static calculateDistance(
    state: SimulationState,
    attacker: EnginePlayer | string,
    defender: EnginePlayer | string
  ): number;
  public static calculateDistance(
    players: Map<string, EnginePlayer>,
    fromPlayerId: string,
    toPlayerId: string
  ): number;
  public static calculateDistance(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    fromArg: EnginePlayer | string,
    toArg: EnginePlayer | string
  ): number {
    const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;
    const players = stateOrPlayers instanceof Map ? stateOrPlayers : stateOrPlayers.players;

    const fromId = typeof fromArg === "string" ? fromArg : fromArg.id;
    const toId = typeof toArg === "string" ? toArg : toArg.id;
    if (fromId === toId) return 0;

    const alive = SeatManager.getAlivePlayers(players, true);
    const fromIndex = alive.findIndex((p) => p.id === fromId);
    const toIndex = alive.findIndex((p) => p.id === toId);
    if (fromIndex === -1 || toIndex === -1) return Infinity;

    const attacker = alive[fromIndex];
    const defender = alive[toIndex];

    const isAmbush = state?.activeEvent?.effectCode === "EVENT_FOC_AMBUSH";
    const count = alive.length;
    const diff = Math.abs(fromIndex - toIndex);
    const baseDistance = isAmbush ? 1 : Math.min(diff, count - diff);

    const turnPlayer = state ? state.players.get(state.turnPlayerId) : undefined;
    let defModifiers = 0;

    // Defender equipment distance bonuses
    if (SkillHooks.isEquipmentEffective(defender, turnPlayer, state)) {
      if (defender.equipments.horseDef) defModifiers += 1;
      for (const card of getAllEquippedCards(defender)) {
        if (card.name === "HIDEOUT") defModifiers += 1;
        if (card.name === "MUSTANG" && !defender.equipments.horseDef) defModifiers += 1;
      }
    }

    // Ambush ignores character distance skills
    if (!isAmbush && SkillHooks.hasSkill(defender, "Paul Regret", state)) {
      defModifiers += 1;
    }

    let offModifiers = 0;

    // Attacker equipment distance reductions
    if (SkillHooks.isEquipmentEffective(attacker, turnPlayer, state)) {
      if (attacker.equipments.horseOff) offModifiers += 1;
      for (const card of getAllEquippedCards(attacker)) {
        if (normalizeEquipName(card.name) === "BINOCULAR") offModifiers += 1;
        if (card.name === "SCOPE" && !attacker.equipments.horseOff) offModifiers += 1;
      }
    }

    if (!isAmbush && SkillHooks.hasSkill(attacker, "Rose Doolan", state)) {
      offModifiers += 1;
    }

    return Math.max(1, baseDistance + defModifiers - offModifiers);
  }

  // Get effective weapon range
  public static getAttackerWeaponRange(
    state: SimulationState,
    attacker: EnginePlayer
  ): number {
    const turnPlayer = state.players.get(state.turnPlayerId);
    if (
      attacker.equipments.weapon &&
      SkillHooks.isEquipmentEffective(attacker, turnPlayer, state)
    ) {
      return attacker.equipments.weapon.weaponRange || 1;
    }
    return 1;
  }

  // Check if target within weapon range
  public static isTargetInRange(
    state: SimulationState,
    fromPlayer: EnginePlayer | string,
    toPlayer: EnginePlayer | string,
    customWeaponRange?: number
  ): boolean;
  public static isTargetInRange(
    players: Map<string, EnginePlayer>,
    fromPlayerId: string,
    toPlayerId: string,
    customWeaponRange?: number
  ): boolean;
  public static isTargetInRange(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    fromArg: EnginePlayer | string,
    toArg: EnginePlayer | string,
    customWeaponRange?: number
  ): boolean {
    const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;
    const players = stateOrPlayers instanceof Map ? stateOrPlayers : stateOrPlayers.players;
    const fromPlayer = typeof fromArg === "string" ? players.get(fromArg) : fromArg;
    if (!fromPlayer) return false;

    const distance = state
      ? this.calculateDistance(state, fromArg, toArg)
      : this.calculateDistance(
          players,
          typeof fromArg === "string" ? fromArg : fromArg.id,
          typeof toArg === "string" ? toArg : toArg.id
        );

    const weaponRange =
      customWeaponRange ??
      (state
        ? this.getAttackerWeaponRange(state, fromPlayer)
        : fromPlayer.equipments.weapon?.weaponRange ?? 1);

    return distance <= weaponRange;
  }
}
