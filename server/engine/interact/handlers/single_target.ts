import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard, ActiveGreenCard } from "../../types/cards";
import { CommandResult, DomainEvent, PlayerCommand } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { TargetValidator, TargetArea } from "../../combat/target_validator";
import { BangLimiter } from "../../combat/bang_limiter";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { AtomicEffects } from "../primitives/atomic_effects";

export class SingleTargetActions {
  // Resolve Ricochet target card ID
  private static resolveRicochetTargetCardId(
    targetPlayer: EnginePlayer,
    area: "EQUIPMENT" | "GREEN" | "JUDGEMENT",
    requestedId?: string
  ): string | undefined {
    if (area === "EQUIPMENT") {
      const eq = targetPlayer.equipments;
      const list: EngineCard[] = [];
      if (eq.weapon) list.push(eq.weapon);
      if (eq.horseDef) list.push(eq.horseDef);
      if (eq.horseOff) list.push(eq.horseOff);
      if (eq.barrel) list.push(eq.barrel);
      for (const item of eq.extras || []) {
        if (item && !list.some((c) => c.id === item.id)) list.push(item);
      }
      if (eq.extra && !list.some((c) => c.id === eq.extra!.id)) {
        list.push(eq.extra);
      }
      if (requestedId) {
        return list.find((c) => c.id === requestedId)?.id;
      }
      return list[0]?.id;
    }

    if (area === "GREEN") {
      const list = targetPlayer.greenCards || [];
      if (requestedId) {
        const match = list.find((g) => g.id === requestedId || g.card.id === requestedId);
        return match?.card.id;
      }
      return list[0]?.card.id;
    }

    const list = targetPlayer.judgements || [];
    if (requestedId) {
      const match = list.find((j) => j.id === requestedId || j.card.id === requestedId);
      return match?.card.id;
    }
    return list[0]?.card.id;
  }

  // Remove specific card IDs from hand
  private static removeHandCardsById(
    player: EnginePlayer,
    cardIds: string[]
  ): EngineCard[] {
    const idSet = new Set(cardIds);
    const removed: EngineCard[] = [];
    player.handCards = player.handCards.filter((c) => {
      if (idSet.has(c.id)) {
        removed.push(c);
        return false;
      }
      return true;
    });
    return removed;
  }

  // Handle BANG!, Sniper, and Ricochet
  public static handleBang(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer,
    card: EngineCard,
    _cardIndex: number,
    deckManager?: DeckManager,
    command?: PlayerCommand
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const code = state.activeEvent?.effectCode;
    const isRicochet =
      code === "EVENT_FOC_RICOCHET" &&
      Boolean(command?.targetArea && command.targetArea !== "HAND");

    if (isRicochet && command?.targetArea) {
      if (
        command.targetArea !== "EQUIPMENT" &&
        command.targetArea !== "GREEN" &&
        command.targetArea !== "JUDGEMENT"
      ) {
        return { success: false, message: "Ricochet targets cards in play only." };
      }

      const targetArea = command.targetArea as "EQUIPMENT" | "GREEN" | "JUDGEMENT";
      const validation = TargetValidator.validate(state, card, player, targetPlayer, {
        targetArea: targetArea as TargetArea,
        targetCardId: command.targetCardId,
        requiresRange: false,
      });
      if (!validation.valid) {
        return { success: false, message: validation.reason };
      }

      const resolvedCardId = this.resolveRicochetTargetCardId(
        targetPlayer,
        targetArea,
        command.targetCardId
      );
      if (!resolvedCardId) {
        return { success: false, message: "Target card not found in play." };
      }

      this.removeHandCardsById(player, [card.id]);
      AtomicEffects.discardCard(state, card, deckManager);

      const reactionRes = AtomicEffects.createReaction(
        state,
        targetPlayer,
        player,
        card,
        {
          type: "EVENT_RICOCHET_DEFENSE",
          requiredCard: "MISSED",
          requiredCount: 1,
          allowBarrel: false,
          allowJourdonnais: false,
        },
        {
          ricochetTargetArea: targetArea,
          ricochetTargetCardId: resolvedCardId,
        }
      );

      const events: DomainEvent[] = [...reactionRes.events];
      if (!reactionRes.isImmune && reactionRes.reaction) {
        events.push({
          type: "RICOCHET_SHOT_LAUNCHED",
          payload: {
            attackerId: player.id,
            attackerName: player.name,
            targetId: targetPlayer.id,
            targetName: targetPlayer.name,
            targetArea,
            targetCardId: resolvedCardId,
            card,
          },
          timestamp: Date.now(),
        });
      }

      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    if (!BangLimiter.canPlayBang(state, player)) {
      return {
        success: false,
        message: "You have already reached the BANG! limit this turn.",
      };
    }

    const validation = TargetValidator.validate(state, card, player, targetPlayer, {
      requiresRange: true,
    });
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    let sniperExtraCard: EngineCard | undefined;
    if (
      code === "EVENT_FOC_SNIPER" &&
      command?.discardCardIds &&
      command.discardCardIds.length > 0
    ) {
      const extraId = command.discardCardIds[0];
      const candidate =
        extraId !== card.id
          ? player.handCards.find((c) => c.id === extraId)
          : undefined;
      const isBangLike =
        candidate &&
        (candidate.name === "BANG!" ||
          (candidate.name === "MISSED!" &&
            SkillHooks.hasSkill(player, "Calamity Janet", state)));
      if (!isBangLike) {
        return {
          success: false,
          message: "Sniper requires discarding a second BANG! card.",
        };
      }
      sniperExtraCard = candidate;
    }

    const idsToDiscard = sniperExtraCard ? [card.id, sniperExtraCard.id] : [card.id];
    const removed = this.removeHandCardsById(player, idsToDiscard);
    AtomicEffects.discardCards(state, removed, deckManager);
    state.bangCountThisTurn += 1;

    const reactionRes = AtomicEffects.createReaction(state, targetPlayer, player, card, {
      type: "BANG_DEFENSE",
      requiredCard: "MISSED",
      requiredCount: sniperExtraCard ? 2 : undefined,
      allowBarrel: true,
      allowJourdonnais: true,
    });

    const events: DomainEvent[] = [...reactionRes.events];

    if (!reactionRes.isImmune && reactionRes.reaction) {
      events.push({
        type: "BANG_ATTACK_LAUNCHED",
        payload: {
          attackerId: player.id,
          attackerName: player.name,
          targetId: targetPlayer.id,
          targetName: targetPlayer.name,
          card,
          isSniper: Boolean(sniperExtraCard),
          requiredMissedCount: reactionRes.reaction.requiredCount,
          canUseBarrel: reactionRes.reaction.canUseBarrel,
          canUseJourdonnais: reactionRes.reaction.canUseJourdonnais,
        },
        timestamp: Date.now(),
      });
    }

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // Handle Punch at distance 1
  public static handlePunch(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const validation = TargetValidator.validate(state, card, player, targetPlayer, {
      exactDistance: 1,
    });
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    player.handCards.splice(cardIndex, 1);
    AtomicEffects.discardCard(state, card, deckManager);

    const reactionRes = AtomicEffects.createReaction(state, targetPlayer, player, card, {
      type: "BANG_DEFENSE",
      requiredCard: "MISSED",
      requiredCount: 1,
      allowBarrel: true,
      allowJourdonnais: true,
    });

    const events: DomainEvent[] = [...reactionRes.events];
    if (!reactionRes.isImmune && reactionRes.reaction) {
      events.push({
        type: "PUNCH_LAUNCHED",
        payload: { attackerId: player.id, targetId: targetPlayer.id, card },
        timestamp: Date.now(),
      });
    }

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // Handle Springfield with extra discard
  public static handleSpringfield(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer,
    card: EngineCard,
    _cardIndex: number,
    extraCardId: string | undefined,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const validation = TargetValidator.validate(state, card, player, targetPlayer, {
      requiresRange: false,
    });
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    if (!extraCardId || extraCardId === card.id) {
      return {
        success: false,
        message: "Springfield requires discarding 1 extra card.",
      };
    }

    const extraCard = player.handCards.find((c) => c.id === extraCardId);
    if (!extraCard) {
      return { success: false, message: "Valid extra card required." };
    }

    const removed = this.removeHandCardsById(player, [card.id, extraCard.id]);
    AtomicEffects.discardCards(state, removed, deckManager);

    const reactionRes = AtomicEffects.createReaction(state, targetPlayer, player, card, {
      type: "BANG_DEFENSE",
      requiredCard: "MISSED",
      requiredCount: 1,
      allowBarrel: true,
      allowJourdonnais: true,
    });

    const events: DomainEvent[] = [...reactionRes.events];
    if (!reactionRes.isImmune && reactionRes.reaction) {
      events.push({
        type: "SPRINGFIELD_LAUNCHED",
        payload: {
          attackerId: player.id,
          targetId: targetPlayer.id,
          card,
          extraCard,
        },
        timestamp: Date.now(),
      });
    }

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // Activate green card in play
  public static handleActivateGreenCard(
    state: SimulationState,
    player: EnginePlayer,
    greenEntry: ActiveGreenCard,
    targetPlayer?: EnginePlayer,
    deckManager?: DeckManager
  ): CommandResult {
    if (greenEntry.isDelay) {
      return {
        success: false,
        message: "Green cards cannot be activated on the turn they are played.",
      };
    }

    if (!SkillHooks.isEquipmentEffective(player, player, state)) {
      return {
        success: false,
        message: "Cards in play have no effect under the current event.",
      };
    }

    const greenIdx = player.greenCards.findIndex((g) => g.id === greenEntry.id);
    if (greenIdx === -1) {
      return { success: false, message: "Green card not found in play." };
    }

    const card = greenEntry.card;
    const events: DomainEvent[] = [];

    if (card.name === "PONY EXPRESS") {
      player.greenCards.splice(greenIdx, 1);
      AtomicEffects.discardCard(state, card, deckManager);

      const { cards: drawn, events: drawEvents } = AtomicEffects.drawCards(
        state,
        3,
        deckManager
      );
      player.handCards.push(...drawn);
      events.push(...drawEvents);
      events.push({
        type: "GREEN_CARD_ACTIVATED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card,
          drawnCount: drawn.length,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    if (card.name === "CANTEEN") {
      if (player.isGhost) {
        return { success: false, message: "Ghosts cannot regain life points." };
      }
      if (player.hp >= player.maxHp) {
        return { success: false, message: "Already at maximum HP." };
      }

      player.greenCards.splice(greenIdx, 1);
      AtomicEffects.discardCard(state, card, deckManager);
      AtomicEffects.applyHeal(state, player, 1, card, events, deckManager);

      events.push({
        type: "GREEN_CARD_ACTIVATED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card,
          currentHp: player.hp,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    if (
      card.name === "BUFFALO RIFLE" ||
      card.name === "PEPPERBOX" ||
      card.name === "DERRINGER" ||
      card.name === "KNIFE"
    ) {
      const valOptions =
        card.name === "BUFFALO RIFLE"
          ? { requiresRange: false }
          : card.name === "PEPPERBOX"
          ? { requiresRange: true }
          : { exactDistance: 1 };

      const validation = TargetValidator.validate(
        state,
        card,
        player,
        targetPlayer,
        valOptions
      );
      if (!validation.valid || !targetPlayer) {
        return { success: false, message: validation.reason ?? "Invalid target." };
      }

      player.greenCards.splice(greenIdx, 1);
      AtomicEffects.discardCard(state, card, deckManager);

      if (card.name === "DERRINGER") {
        const { cards: drawn, events: drawEvents } = AtomicEffects.drawCards(
          state,
          1,
          deckManager
        );
        player.handCards.push(...drawn);
        events.push(...drawEvents);
      }

      const reactionRes = AtomicEffects.createReaction(
        state,
        targetPlayer,
        player,
        card,
        {
          type: "BANG_DEFENSE",
          requiredCard: "MISSED",
          requiredCount: 1,
          allowBarrel: true,
          allowJourdonnais: true,
        }
      );
      events.push(...reactionRes.events);

      events.push({
        type: "GREEN_CARD_ACTIVATED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          targetId: targetPlayer.id,
          card,
          evadedByImmunity: reactionRes.isImmune,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    return {
      success: false,
      message: `Unsupported active green card: ${card.name}`,
    };
  }
}
