import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { SkillHooks } from "../skill_hooks";
import { PendingReaction } from "../interact_types";
import { AtomicEffects } from "../primitives/atomic_effects";
import { ArenaChainManager } from "../../arena/arena_chain_manager";

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

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        targetPlayerId: targetPlayer.id,
        targetPlayerName: targetPlayer.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: `${card.name} -> ${targetPlayer.name}`,
        vfxType: "bullet",
        vfxTargetId: targetPlayer.id,
      },
    ]);

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
