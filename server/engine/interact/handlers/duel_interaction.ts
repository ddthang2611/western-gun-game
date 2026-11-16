import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { SkillHooks } from "../skill_hooks";
import { PendingReaction } from "../interact_types";
import { AtomicEffects } from "../primitives/atomic_effects";

export class DuelInteraction {
  public static handleStartDuel(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    player.handCards.splice(cardIndex, 1);
    AtomicEffects.discardCard(state, card, deckManager);

    if (SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
      const immuneEvents: DomainEvent[] = [
        {
          type: "APACHE_KID_IMMUNITY",
          payload: { sourcePlayerId: player.id, targetPlayerId: targetPlayer.id, card },
          timestamp: Date.now(),
        },
      ];
      SkillHooks.checkSuzyLafayette(state, player, immuneEvents);
      return {
        success: true,
        events: immuneEvents,
      };
    }

    // Target responds first in Duel
    const reaction: PendingReaction = {
      id: `reaction_duel_${targetPlayer.id}_${Date.now()}`,
      type: "DUEL_RESPONSE",
      sourcePlayerId: player.id,
      targetPlayerId: targetPlayer.id,
      sourceCard: card,
      requiredCard: "BANG",
      requiredCount: 1,
      currentCount: 0,
      canUseBarrel: false,
      canUseJourdonnais: false,
      barrelChecked: false,
      jourdonnaisChecked: false,
      createdAt: Date.now(),
    };

    state.pendingReactions.push(reaction);

    const events: DomainEvent[] = [
      {
        type: "DUEL_STARTED",
        payload: {
          initiatorId: player.id,
          initiatorName: player.name,
          targetId: targetPlayer.id,
          targetName: targetPlayer.name,
          card,
          nextResponderId: targetPlayer.id,
        },
        timestamp: Date.now(),
      },
    ];

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }
}
