import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { TargetValidator, TargetArea } from "../../combat/target_validator";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { AtomicEffects } from "../primitives/atomic_effects";
import { getAllEquippedCards } from "../../utils/inventory";

export class CardManipulation {
  // Check target area availability
  private static hasTargetCard(
    targetPlayer: EnginePlayer,
    targetArea: TargetArea,
    targetCardId?: string
  ): boolean {
    if (targetArea === "HAND") {
      return targetPlayer.handCards.length > 0;
    }

    if (targetArea === "EQUIPMENT") {
      const list = getAllEquippedCards(targetPlayer);
      return targetCardId ? list.some((c) => c.id === targetCardId) : list.length > 0;
    }

    if (targetArea === "GREEN") {
      const list = targetPlayer.greenCards || [];
      return targetCardId
        ? list.some((g) => g.id === targetCardId || g.card.id === targetCardId)
        : list.length > 0;
    }

    if (targetArea === "JUDGEMENT") {
      const list = targetPlayer.judgements || [];
      return targetCardId
        ? list.some((j) => j.id === targetCardId || j.card.id === targetCardId)
        : list.length > 0;
    }

    return false;
  }

  // Handle steal or destroy card
  public static handleTheftOrDestruction(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    targetArea: TargetArea = "HAND",
    targetCardId: string | undefined,
    deckManager?: DeckManager,
    extraCardId?: string,
    fromGreenEntryId?: string
  ): CommandResult {
    const isSteal =
      card.name === "PANIC!" ||
      card.name === "RAG TIME" ||
      card.name === "CONESTOGA";
    const isDestroy =
      card.name === "CAT BALOU" || card.name === "CAN CAN";

    if (!isSteal && !isDestroy) {
      return { success: false, message: `Unsupported card manipulation: ${card.name}` };
    }

    // Validate card source before mutation
    let resolvedHandIndex = -1;
    let resolvedGreenIndex = -1;

    if (fromGreenEntryId) {
      const turnPlayer = state.players.get(state.turnPlayerId);
      if (!SkillHooks.isEquipmentEffective(player, turnPlayer, state)) {
        return {
          success: false,
          message: "Green card abilities are currently negated.",
        };
      }

      const greenCards = player.greenCards || [];
      resolvedGreenIndex = greenCards.findIndex(
        (g) => g.id === fromGreenEntryId || g.card.id === fromGreenEntryId
      );
      if (resolvedGreenIndex === -1) {
        return { success: false, message: "Green card not found in play." };
      }
      if (greenCards[resolvedGreenIndex].isDelay) {
        return {
          success: false,
          message: "Green card cannot be activated on the turn it was played.",
        };
      }
    } else {
      const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
      if (blockReason) {
        return { success: false, message: blockReason };
      }

      resolvedHandIndex =
        cardIndex >= 0 &&
        cardIndex < player.handCards.length &&
        player.handCards[cardIndex].id === card.id
          ? cardIndex
          : player.handCards.findIndex((c) => c.id === card.id);
      if (resolvedHandIndex === -1) {
        return { success: false, message: "Card not in hand." };
      }
    }

    // Validate Rag Time extra discard
    if (card.name === "RAG TIME") {
      if (!extraCardId || extraCardId === card.id) {
        return {
          success: false,
          message: "Rag Time requires discarding another card from hand.",
        };
      }
      const extraExists = player.handCards.some((c) => c.id === extraCardId);
      if (!extraExists) {
        return {
          success: false,
          message: "Extra discard card for Rag Time not found in hand.",
        };
      }
    }

    // Validate target and distance rules
    const validation = TargetValidator.validate(state, card, player, targetPlayer, {
      targetArea,
      targetCardId,
      exactDistance: card.name === "PANIC!" ? 1 : undefined,
      requiresRange: card.name === "PANIC!" ? undefined : false,
    });
    if (!validation.valid) {
      return { success: false, message: validation.reason ?? "Invalid target." };
    }

    if (!this.hasTargetCard(targetPlayer, targetArea, targetCardId)) {
      return {
        success: false,
        message: `Target card not found in ${targetArea.toLowerCase()}.`,
      };
    }

    // Consume source and cost cards
    if (fromGreenEntryId) {
      const removedGreen = (player.greenCards || []).splice(resolvedGreenIndex, 1)[0];
      AtomicEffects.discardCard(state, removedGreen.card, deckManager);
    } else {
      const played = player.handCards.splice(resolvedHandIndex, 1)[0];
      AtomicEffects.discardCard(state, played, deckManager);
    }

    if (card.name === "RAG TIME" && extraCardId) {
      const extraIdx = player.handCards.findIndex((c) => c.id === extraCardId);
      if (extraIdx !== -1) {
        const extraCard = player.handCards.splice(extraIdx, 1)[0];
        AtomicEffects.discardCard(state, extraCard, deckManager);
      }
    }

    const events: DomainEvent[] = [];

    // Check Apache Kid card immunity
    if (SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
      events.push({
        type: "APACHE_KID_IMMUNITY",
        payload: {
          sourcePlayerId: player.id,
          targetPlayerId: targetPlayer.id,
          card,
        },
        timestamp: Date.now(),
      });

      if (fromGreenEntryId) {
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetId: targetPlayer.id,
            card,
            evadedByImmunity: true,
          },
          timestamp: Date.now(),
        });
      } else {
        SkillHooks.checkSuzyLafayette(state, player, events);
      }
      return { success: true, events };
    }

    const transferred = isSteal
      ? AtomicEffects.stealCard(
          state,
          player,
          targetPlayer,
          targetArea,
          targetCardId,
          events,
          deckManager
        )
      : AtomicEffects.destroyCard(
          state,
          player,
          targetPlayer,
          targetArea,
          targetCardId,
          events,
          deckManager
        );

    if (!transferred) {
      return { success: false, message: "Target card not found." };
    }

    if (fromGreenEntryId) {
      const hideTransferred = isSteal && targetArea === "HAND";
      events.push({
        type: "GREEN_CARD_ACTIVATED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          targetId: targetPlayer.id,
          card,
          ...(hideTransferred ? {} : { transferredCard: transferred }),
        },
        timestamp: Date.now(),
      });
    } else {
      SkillHooks.checkSuzyLafayette(state, player, events);
    }

    return { success: true, events };
  }
}
