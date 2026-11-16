import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard, ActiveGreenCard } from "../../types/cards";
import {
  CommandResult,
  DomainEvent,
  PlayerCommand,
  TargetSelectionEntry,
} from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { TargetArea } from "../../combat/target_validator";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { AoePipeline } from "../pipeline/aoe_pipeline";
import { AtomicEffects } from "../primitives/atomic_effects";
import { ClockwiseTraversal } from "../primitives/clockwise_traversal";

export class AoeActions {
  // Consume hand card safely
  private static consumeHandCard(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): boolean {
    const resolvedIdx =
      cardIndex >= 0 &&
      cardIndex < player.handCards.length &&
      player.handCards[cardIndex].id === card.id
        ? cardIndex
        : player.handCards.findIndex((c) => c.id === card.id);
    if (resolvedIdx === -1) return false;

    const removed = player.handCards.splice(resolvedIdx, 1)[0];
    AtomicEffects.discardCard(state, removed, deckManager);
    return true;
  }

  // Handle INDIANS! AOE attack
  public static handleIndians(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
      return { success: false, message: "Card not in hand." };
    }

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeReactionAoe(state, player, card, "ALL_OTHERS", () => ({
      type: "INDIANS_DEFENSE",
      requiredCard: "BANG",
      requiredCount: 1,
      allowBarrel: false,
      allowJourdonnais: false,
    }));

    return {
      success: res.success,
      message: res.message,
      events: [...suzyEvents, ...(res.events || [])],
    };
  }

  // Handle GATLING AOE attack
  public static handleGatling(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
      return { success: false, message: "Card not in hand." };
    }

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeReactionAoe(state, player, card, "ALL_OTHERS", () => ({
      type: "GATLING_DEFENSE",
      requiredCard: "MISSED",
      requiredCount: 1,
      allowBarrel: true,
      allowJourdonnais: true,
    }));

    return {
      success: res.success,
      message: res.message,
      events: [...suzyEvents, ...(res.events || [])],
    };
  }

  // Handle active HOWITZER green card
  public static handleHowitzer(
    state: SimulationState,
    player: EnginePlayer,
    greenEntry: ActiveGreenCard,
    deckManager?: DeckManager
  ): CommandResult {
    const turnPlayer = state.players.get(state.turnPlayerId);
    if (!SkillHooks.isEquipmentEffective(player, turnPlayer, state)) {
      return {
        success: false,
        message: "Green card abilities are currently negated.",
      };
    }

    const greenCards = player.greenCards || [];
    const idx = greenCards.findIndex(
      (g) => g.id === greenEntry.id || g.card.id === greenEntry.card.id
    );
    if (idx === -1) {
      return { success: false, message: "Howitzer not found in play." };
    }

    const entry = greenCards[idx];
    if (entry.isDelay) {
      return {
        success: false,
        message: "Green card cannot be activated on the turn it was played.",
      };
    }

    greenCards.splice(idx, 1);
    AtomicEffects.discardCard(state, entry.card, deckManager);

    const res = AoePipeline.executeReactionAoe(
      state,
      player,
      entry.card,
      "ALL_OTHERS",
      () => ({
        type: "GATLING_DEFENSE",
        requiredCard: "MISSED",
        requiredCount: 1,
        allowBarrel: true,
        allowJourdonnais: true,
      })
    );

    const events: DomainEvent[] = [
      {
        type: "GREEN_CARD_ACTIVATED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: entry.card,
        },
        timestamp: Date.now(),
      },
      ...(res.events || []),
    ];

    return {
      success: res.success,
      message: res.message,
      events,
    };
  }

  // Handle SALOON all-player heal
  public static handleSaloon(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
      return { success: false, message: "Card not in hand." };
    }

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeInstantAoe(
      state,
      player,
      card,
      "ALL_PLAYERS",
      (target) => {
        const stepEvents: DomainEvent[] = [];
        AtomicEffects.applyHeal(state, target, 1, card, stepEvents, deckManager);
        return stepEvents;
      }
    );

    return {
      success: res.success,
      message: res.message,
      events: [
        ...suzyEvents,
        ...(res.events || []),
        {
          type: "SALOON_HEALED",
          payload: { sourcePlayerId: player.id, card },
          timestamp: Date.now(),
        },
      ],
    };
  }

  // Handle GENERAL STORE draft pool
  public static handleGeneralStore(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
      return { success: false, message: "Card not in hand." };
    }

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeDraftStoreAoe(state, player, card, deckManager);
    return {
      success: res.success,
      message: res.message,
      events: [...suzyEvents, ...(res.events || [])],
    };
  }

  // Handle BRAWL multi-target destruction
  public static handleBrawl(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    command?: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const extraCardId = command?.discardCardIds?.[0];
    if (!extraCardId || extraCardId === card.id) {
      return {
        success: false,
        message: "Brawl requires discarding another card from hand.",
      };
    }

    const hasExtra = player.handCards.some((c) => c.id === extraCardId);
    if (!hasExtra) {
      return {
        success: false,
        message: "Extra discard card for Brawl not found in hand.",
      };
    }

    if (!this.consumeHandCard(state, player, card, cardIndex, deckManager)) {
      return { success: false, message: "Card not in hand." };
    }

    const extraIdx = player.handCards.findIndex((c) => c.id === extraCardId);
    if (extraIdx !== -1) {
      const extraCard = player.handCards.splice(extraIdx, 1)[0];
      AtomicEffects.discardCard(state, extraCard, deckManager);
    }

    const selectionMap = new Map<string, TargetSelectionEntry>();
    for (const sel of command?.targetSelections || []) {
      selectionMap.set(sel.targetPlayerId, sel);
    }

    const events: DomainEvent[] = [];
    const targets = ClockwiseTraversal.getTraversalList(
      state,
      player.id,
      "ALL_OTHERS"
    );
    const fallbackAreas: TargetArea[] = [
      "HAND",
      "EQUIPMENT",
      "GREEN",
      "JUDGEMENT",
    ];
    let affectedCount = 0;

    for (const target of targets) {
      if (SkillHooks.isImmuneToCard(target, card, player, state)) {
        events.push({
          type: "APACHE_KID_IMMUNITY",
          payload: {
            sourcePlayerId: player.id,
            targetPlayerId: target.id,
            card,
          },
          timestamp: Date.now(),
        });
        continue;
      }

      const sel = selectionMap.get(target.id);
      let destroyed: EngineCard | null = null;

      if (sel?.targetArea) {
        destroyed = AtomicEffects.destroyCard(
          state,
          player,
          target,
          sel.targetArea,
          sel.targetCardId,
          events,
          deckManager
        );
      }

      if (!destroyed) {
        for (const area of fallbackAreas) {
          destroyed = AtomicEffects.destroyCard(
            state,
            player,
            target,
            area,
            undefined,
            events,
            deckManager
          );
          if (destroyed) break;
        }
      }

      if (destroyed) {
        affectedCount += 1;
      }
    }

    events.push({
      type: "BRAWL_RESOLVED",
      payload: {
        sourcePlayerId: player.id,
        sourcePlayerName: player.name,
        card,
        affectedCount,
      },
      timestamp: Date.now(),
    });

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }
}
