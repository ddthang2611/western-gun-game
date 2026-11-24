import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { SkillHooks } from "../skill_hooks";
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

    const duelImmune = SkillHooks.isImmuneToCard(targetPlayer, card, player, state);
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
        vfxType: duelImmune ? undefined : "bullet",
        vfxTargetId: targetPlayer.id,
      },
    ]);

    // Target responds first in Duel
    const reactionRes = AtomicEffects.createReaction(
      state,
      targetPlayer,
      player,
      card,
      {
        type: "DUEL_RESPONSE",
        requiredCard: "BANG",
        requiredCount: 1,
        allowBarrel: false,
        allowJourdonnais: false,
      },
      { duelInitiatorId: player.id }
    );

    const events: DomainEvent[] = [...reactionRes.events];
    if (!reactionRes.isImmune && reactionRes.reaction) {
      events.push({
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
      });
    }

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }
}
