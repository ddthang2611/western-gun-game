import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { SeatManager } from "../../board/seat_manager";
import { EventEngine } from "../../events/event_engine";
import { SkillHooks } from "../skill_hooks";
import { AtomicEffects } from "../primitives/atomic_effects";
import { AoeActions } from "./aoe_actions";

export class HealActions {
  // Remove specified card IDs from hand
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

  // Heal all living contenders
  public static handleSaloon(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    return AoeActions.handleSaloon(state, player, card, cardIndex, deckManager);
  }

  // Heal self unless The Reverend or 2P
  public static handleBeer(
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

    player.handCards.splice(cardIndex, 1);
    AtomicEffects.discardCard(state, card, deckManager);

    const events: DomainEvent[] = [];
    const living = SeatManager.getLivingContenders(state);

    if (living.length <= 2) {
      events.push({
        type: "BEER_NO_EFFECT_2P",
        payload: {
          playerId: player.id,
          card,
          message: "Beer has no effect when only 2 players remain.",
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    const beerHeal = SkillHooks.getBeerHealAmount(player, state);
    if (beerHeal > 1 && SkillHooks.hasSkill(player, "Tequila Joe", state)) {
      events.push({
        type: "ACTIVE_SKILL_USED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          skill: "Tequila Joe",
          detail: `healed +${beerHeal} HP from Beer`,
        },
        timestamp: Date.now(),
      });
    }
    AtomicEffects.applyHeal(state, player, 1, card, events, deckManager);
    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // Heal self 2 HP with extra discard
  public static handleWhisky(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    _cardIndex: number,
    extraCardId: string | undefined,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    if (!extraCardId || extraCardId === card.id) {
      return { success: false, message: "Whisky requires discarding 1 extra card." };
    }
    const extraCard = player.handCards.find((c) => c.id === extraCardId);
    if (!extraCard) {
      return { success: false, message: "Valid extra card required." };
    }

    const removed = this.removeHandCardsById(player, [card.id, extraCard.id]);
    AtomicEffects.discardCards(state, removed, deckManager);

    const events: DomainEvent[] = [];
    AtomicEffects.applyHeal(state, player, 2, card, events, deckManager);
    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // Heal target 1 HP with extra discard
  public static handleTequila(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer | undefined,
    card: EngineCard,
    _cardIndex: number,
    extraCardId: string | undefined,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const target = targetPlayer ?? player;
    if (target.isDead || target.isGhost) {
      return { success: false, message: "Target player cannot regain life points." };
    }

    if (!extraCardId || extraCardId === card.id) {
      return { success: false, message: "Tequila requires discarding 1 extra card." };
    }
    const extraCard = player.handCards.find((c) => c.id === extraCardId);
    if (!extraCard) {
      return { success: false, message: "Valid extra card required." };
    }

    const removed = this.removeHandCardsById(player, [card.id, extraCard.id]);
    AtomicEffects.discardCards(state, removed, deckManager);

    const events: DomainEvent[] = [];
    if (
      target.id !== player.id &&
      SkillHooks.isImmuneToCard(target, card, player, state)
    ) {
      events.push({
        type: "APACHE_KID_IMMUNITY",
        payload: {
          sourcePlayerId: player.id,
          targetPlayerId: target.id,
          card,
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    AtomicEffects.applyHeal(state, target, 1, card, events, deckManager);
    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }
}
