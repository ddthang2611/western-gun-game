import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard, ActiveGreenCard } from "../../types/cards";
import {
  CommandResult,
  DomainEvent,
  PlayerCommand,
  TargetSelectionEntry,
} from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { AoePipeline } from "../pipeline/aoe_pipeline";
import { AtomicEffects } from "../primitives/atomic_effects";
import { ClockwiseTraversal } from "../primitives/clockwise_traversal";
import { ArenaChainManager } from "../../arena/arena_chain_manager";
import { BrawlCardPickState } from "../interact_types";
import { countPlayerTotalCards, hasTargetCardInArea } from "../../utils/inventory";

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

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: card.name,
        vfxType: "bullet",
        vfxAoe: true,
      },
    ]);

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

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: card.name,
        vfxType: "bullet",
        vfxAoe: true,
      },
    ]);

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

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card: entry.card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "GREEN",
        destinationZone: "DISCARD",
        actionLabel: entry.card.name,
        vfxType: "bullet",
        vfxAoe: true,
      },
    ]);

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

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: `${card.name} (+1 HP All)`,
        vfxType: "heal",
        vfxAoe: true,
      },
    ]);

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = AoePipeline.executeInstantAoe(
      state,
      player,
      card,
      "ALL_PLAYERS",
      (target) => {
        const stepEvents: DomainEvent[] = [];
        if (SkillHooks.isImmuneToCard(target, card, player, state)) {
          stepEvents.push({
            type: "APACHE_KID_IMMUNITY",
            payload: {
              sourcePlayerId: player.id,
              targetPlayerId: target.id,
              playerId: target.id,
              card,
            },
            timestamp: Date.now(),
          });
          return stepEvents;
        }
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

  // Resolve BRAWL targets sequentially
  public static resolveBrawlTargets(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    command?: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
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
    const remainingTargetIds: string[] = [];
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

      if (countPlayerTotalCards(target) === 0) {
        continue;
      }

      const sel = selectionMap.get(target.id);
      if (
        sel?.targetArea &&
        hasTargetCardInArea(target, sel.targetArea, sel.targetCardId)
      ) {
        const destroyed = AtomicEffects.destroyCard(
          state,
          player,
          target,
          sel.targetArea,
          sel.targetCardId,
          events,
          deckManager
        );
        if (destroyed) {
          affectedCount += 1;
          continue;
        }
      }

      remainingTargetIds.push(target.id);
    }

    if (remainingTargetIds.length === 0) {
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
      return { success: true, events };
    }

    const brawlState: BrawlCardPickState = {
      type: "BRAWL_CARD_PICK",
      actorPlayerId: player.id,
      sourceCard: card,
      remainingTargetIds,
      currentTargetId: remainingTargetIds[0],
      affectedCount,
    };
    state.activeChain.push(brawlState);

    events.push({
      type: "BRAWL_PICK_STARTED",
      payload: {
        sourcePlayerId: player.id,
        sourcePlayerName: player.name,
        currentTargetId: remainingTargetIds[0],
        remainingCount: remainingTargetIds.length,
        card,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
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
    let extraCard: EngineCard | undefined;
    if (extraIdx !== -1) {
      extraCard = player.handCards.splice(extraIdx, 1)[0];
      AtomicEffects.discardCard(state, extraCard, deckManager);
    }

    ArenaChainManager.appendBatch(state, [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: card.name,
      },
      ...(extraCard
        ? [
            {
              kind: "EXTRA_COST" as const,
              card: extraCard,
              actorPlayerId: player.id,
              actorPlayerName: player.name,
              originZone: "HAND" as const,
              destinationZone: "DISCARD" as const,
              actionLabel: `Discard Cost (${extraCard.name})`,
            },
          ]
        : []),
    ]);

    const suzyEvents: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, suzyEvents);

    const res = this.resolveBrawlTargets(state, player, card, command, deckManager);
    return {
      success: res.success,
      message: res.message,
      events: [...suzyEvents, ...(res.events || [])],
    };
  }
}
