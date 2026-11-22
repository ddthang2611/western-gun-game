import { EnginePlayer, SimulationState } from "../types/state";
import { DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { SkillRegistry } from "../cards/skill_registry";
import { SkillHooks } from "./skill_hooks";
import type { PendingReaction } from "./interact_types";

export class SkillTriggerBus {
  // Trigger empty hand draw hooks
  public static onHandCardsConsumed(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[],
    _deckManager?: DeckManager
  ): void {
    if (player.isDead || player.handCards.length > 0) return;
    if (!player.isGhost && player.hp <= 0) return;

    const activeDefs = SkillRegistry.getActiveDefinitions(player, state);
    if (activeDefs.some((d) => (d.triggers?.onEmptyHandDraw ?? 0) > 0)) {
      SkillHooks.checkSuzyLafayette(state, player, events);
    }
  }

  // Trigger damage taken skill hooks
  public static onDamageApplied(
    state: SimulationState,
    victim: EnginePlayer,
    attacker: EnginePlayer | undefined | null,
    damageAmount: number,
    events: DomainEvent[]
  ): void {
    SkillHooks.onTakeDamage(state, victim, attacker, damageAmount, events);
  }

  // Record or flush out-of-turn play
  public static onOutOfTurnHandCardUsed(
    state: SimulationState,
    player: EnginePlayer,
    reaction: PendingReaction | undefined,
    deferUntilComplete: boolean,
    events: DomainEvent[],
    count: number = 1
  ): void {
    if (state.turnPlayerId === player.id || count <= 0) return;
    const activeDefs = SkillRegistry.getActiveDefinitions(player, state);
    if (!activeDefs.some((d) => (d.triggers?.onOutOfTurnHandCardDeferredDraw ?? 0) > 0)) {
      return;
    }

    if (deferUntilComplete && reaction) {
      for (let i = 0; i < count; i++) {
        SkillHooks.queueDeferredMollyDraw(state, reaction, player);
      }
      return;
    }

    SkillHooks.onPlayOutOfTurn(state, player, events, count);
  }

  // Flush deferred reaction triggers
  public static onReactionCompleted(
    state: SimulationState,
    reaction: PendingReaction,
    events: DomainEvent[]
  ): void {
    SkillHooks.flushDeferredMollyDraws(state, reaction, events);
  }
}
