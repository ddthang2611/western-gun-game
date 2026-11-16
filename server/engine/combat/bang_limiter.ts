import { EnginePlayer, SimulationState } from "../types/state";
import { SkillHooks } from "../interact/skill_hooks";
import { EventRuleRegistry } from "../events/event_rule_registry";

export class BangLimiter {
  // Check BANG! limit for player
  public static canPlayBang(state: SimulationState, player: EnginePlayer): boolean;
  public static canPlayBang(
    player: EnginePlayer,
    currentBangCountThisTurn: number,
    state?: SimulationState
  ): boolean;
  public static canPlayBang(
    stateOrPlayer: SimulationState | EnginePlayer,
    playerOrCount: EnginePlayer | number,
    stateArg?: SimulationState
  ): boolean {
    const state = "bangCountThisTurn" in stateOrPlayer ? stateOrPlayer : stateArg;
    const player =
      "bangCountThisTurn" in stateOrPlayer
        ? (playerOrCount as EnginePlayer)
        : stateOrPlayer;
    const bangCount =
      "bangCountThisTurn" in stateOrPlayer
        ? stateOrPlayer.bangCountThisTurn
        : (playerOrCount as number);

    const eventLimit = EventRuleRegistry.getBangLimit(state, player, 1);
    if (eventLimit <= 0) {
      return false;
    }

    if (SkillHooks.hasSkill(player, "Willy the Kid", state)) {
      return true;
    }

    const turnPlayer = state ? state.players.get(state.turnPlayerId) : undefined;
    if (
      player.equipments.weapon?.name === "VOLCANIC" &&
      SkillHooks.isEquipmentEffective(player, turnPlayer, state)
    ) {
      return true;
    }

    return bangCount < eventLimit;
  }
}
