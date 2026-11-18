import { SimulationState, EnginePlayer } from "../types/state";
import { EngineCard } from "../types/cards";
import { PlayerCommand, CommandResult, DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { TargetValidator } from "../combat/target_validator";
import { BangLimiter } from "../combat/bang_limiter";
import { EventEngine } from "../events/event_engine";
import { SingleTargetActions } from "./handlers/single_target";
import { AoeActions } from "./handlers/aoe_actions";
import { DraftStore } from "./handlers/draft_store";
import { HealActions } from "./handlers/heal_actions";
import { CardManipulation } from "./handlers/card_manipulation";
import { DuelInteraction } from "./handlers/duel_interaction";
import { EquipmentAction } from "./handlers/equipment_action";
import { ActiveSkills } from "./handlers/active_skills";
import { ReactionResolver } from "./reaction_resolver";
import { SkillHooks } from "./skill_hooks";
import { AtomicEffects } from "./primitives/atomic_effects";
import {
  getAllEquippedCards,
  hasEquippedCardByName,
} from "../utils/inventory";

const GREEN_DEFENSE_ONLY = new Set([
  "SOMBRERO",
  "IRON PLATE",
  "TEN GALLON HAT",
  "BIBLE",
]);

export class InteractManager {
  // Draw brown action cards safely
  private static handleDrawCardPlay(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    drawCount: number,
    deckManager?: DeckManager
  ): CommandResult {
    player.handCards.splice(cardIndex, 1);
    AtomicEffects.discardCard(state, card, deckManager);

    const events: DomainEvent[] = [];
    SkillHooks.checkSuzyLafayette(state, player, events);

    const { cards: drawn, events: drawEvents } = AtomicEffects.drawCards(
      state,
      drawCount,
      deckManager
    );
    player.handCards.push(...drawn);
    events.push(...drawEvents);

    events.push({
      type: "CARDS_DRAWN",
      visibleTo: [player.id],
      payload: {
        playerId: player.id,
        playerName: player.name,
        sourceCard: card,
        count: drawn.length,
        cards: drawn,
      },
      maskedPayload: {
        playerId: player.id,
        playerName: player.name,
        sourceCard: card,
        count: drawn.length,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }

  // Clear forced Law of the West
  private static clearForcedPlayIfMatched(
    player: EnginePlayer,
    playedCardId: string | undefined,
    result: CommandResult
  ): CommandResult {
    if (result.success && playedCardId && player.forcedPlayCardId === playedCardId) {
      player.forcedPlayCardId = null;
    }
    return result;
  }

  // Route card play command
  public static resolveCardPlay(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    if (command.greenCardId) {
      return this.resolveActivateGreenCard(state, command, deckManager);
    }

    if (!command.cardId) {
      return { success: false, message: "Card ID is required." };
    }

    const cardIndex = player.handCards.findIndex((c) => c.id === command.cardId);
    if (cardIndex === -1) {
      const greenMatch = (player.greenCards || []).find(
        (g) => g.id === command.cardId || g.card.id === command.cardId
      );
      if (greenMatch) {
        return this.resolveActivateGreenCard(
          state,
          { ...command, greenCardId: greenMatch.id },
          deckManager
        );
      }
      return { success: false, message: "Card not in hand." };
    }

    const card = player.handCards[cardIndex];
    const res = this.executeHandCardPlay(
      state,
      player,
      card,
      cardIndex,
      command,
      deckManager
    );
    if (res.success) {
      res.events = res.events || [];
      const targetName = command.targetPlayerId
        ? state.players.get(command.targetPlayerId)?.name
        : undefined;
      res.events.push({
        type: "CARD_PLAYED_TO_ARENA",
        payload: {
          playerId: player.id,
          playerName: player.name,
          targetPlayerId: command.targetPlayerId,
          targetPlayerName: targetName,
          card,
          isPlacement: card.border === "blue" || card.border === "green",
        },
        timestamp: Date.now(),
      });
    }
    return res;
  }

  private static executeHandCardPlay(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const targetPlayer = command.targetPlayerId
      ? state.players.get(command.targetPlayerId)
      : undefined;

    // A. Single target and draw actions
    const isBangSubstitute =
      card.name === "MISSED!" &&
      SkillHooks.canSubstituteCard(player, card, "BANG", state);

    if (card.name === "BANG!" || isBangSubstitute) {
      if (isBangSubstitute) {
        const bangBlock = EventEngine.shouldBlockPlayCard(state, player, {
          ...card,
          name: "BANG!",
        });
        if (bangBlock) {
          return { success: false, message: bangBlock };
        }
      }
      if (!targetPlayer) {
        return { success: false, message: "Target required for BANG!." };
      }
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        SingleTargetActions.handleBang(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          deckManager,
          command
        )
      );
    }

    if (card.name === "MISSED!" || card.name === "DODGE") {
      return {
        success: false,
        message: `${card.name} can only be played as a reaction to an attack.`,
      };
    }

    if (card.name === "PUNCH") {
      if (!targetPlayer) return { success: false, message: "Target required for Punch." };
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        SingleTargetActions.handlePunch(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          deckManager
        )
      );
    }

    if (card.name === "SPRINGFIELD") {
      if (!targetPlayer) {
        return { success: false, message: "Target required for Springfield." };
      }
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        SingleTargetActions.handleSpringfield(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          command.discardCardIds?.[0],
          deckManager
        )
      );
    }

    if (card.name === "STAGECOACH" || card.name === "WELLS FARGO") {
      const drawCount = card.name === "WELLS FARGO" ? 3 : 2;
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        this.handleDrawCardPlay(state, player, card, cardIndex, drawCount, deckManager)
      );
    }

    // B. AOE actions
    if (card.name === "INDIANS!") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        AoeActions.handleIndians(state, player, card, cardIndex, deckManager)
      );
    }

    if (card.name === "GATLING") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        AoeActions.handleGatling(state, player, card, cardIndex, deckManager)
      );
    }

    if (card.name === "BRAWL") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        AoeActions.handleBrawl(state, player, card, cardIndex, command, deckManager)
      );
    }

    // C. Draft store
    if (card.name === "GENERAL STORE") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        DraftStore.handleGeneralStore(state, player, card, cardIndex, deckManager)
      );
    }

    // D. Heals
    if (card.name === "SALOON") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        HealActions.handleSaloon(state, player, card, cardIndex, deckManager)
      );
    }

    if (card.name === "BEER") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        HealActions.handleBeer(state, player, card, cardIndex, deckManager)
      );
    }

    if (card.name === "WHISKY") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        HealActions.handleWhisky(
          state,
          player,
          card,
          cardIndex,
          command.discardCardIds?.[0],
          deckManager
        )
      );
    }

    if (card.name === "TEQUILA") {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        HealActions.handleTequila(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          command.discardCardIds?.[0],
          deckManager
        )
      );
    }

    // E. Card theft or destruction
    if (
      card.name === "PANIC!" ||
      card.name === "CAT BALOU" ||
      card.name === "RAG TIME"
    ) {
      if (!targetPlayer) {
        return { success: false, message: "Target required for this card." };
      }
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        CardManipulation.handleTheftOrDestruction(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          command.targetArea || "HAND",
          command.targetCardId,
          deckManager,
          command.discardCardIds?.[0]
        )
      );
    }

    // F. Duel
    if (card.name === "DUEL") {
      if (!targetPlayer) return { success: false, message: "Target required for Duel." };
      const validation = TargetValidator.validate(state, card, player, targetPlayer, {
        requiresRange: false,
      });
      if (!validation.valid) {
        return { success: false, message: validation.reason ?? "Invalid target." };
      }

      if (SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
        player.handCards.splice(cardIndex, 1);
        AtomicEffects.discardCard(state, card, deckManager);
        const events: DomainEvent[] = [
          {
            type: "APACHE_KID_IMMUNITY",
            payload: {
              sourcePlayerId: player.id,
              targetPlayerId: targetPlayer.id,
              card,
            },
            timestamp: Date.now(),
          },
        ];
        SkillHooks.checkSuzyLafayette(state, player, events);
        return this.clearForcedPlayIfMatched(player, card.id, { success: true, events });
      }

      const duelDeckManager =
        deckManager ??
        ({
          discard: (c: EngineCard) => AtomicEffects.discardCard(state, c),
          draw: (n: number) => AtomicEffects.drawCards(state, n),
          placeOnTopOfDeck: (c: EngineCard) =>
            DeckManager.placeOnTopOfDeck(state, c),
        } as unknown as DeckManager);

      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        DuelInteraction.handleStartDuel(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          duelDeckManager
        )
      );
    }

    // G. Blue, judgement, green equip
    if (
      card.border === "blue" ||
      card.border === "green" ||
      card.category === "weapon" ||
      card.category === "equipment" ||
      card.category === "green_delayed" ||
      card.category === "green_delay" ||
      card.category === "green_active" ||
      card.category === "judgement" ||
      card.name === "JAIL" ||
      card.name === "DYNAMITE"
    ) {
      return this.clearForcedPlayIfMatched(
        player,
        card.id,
        EquipmentAction.handleEquip(
          state,
          player,
          targetPlayer,
          card,
          cardIndex,
          deckManager
        )
      );
    }

    return { success: false, message: `Unsupported action card: ${card.name}` };
  }

  // Activate ready green card
  public static resolveActivateGreenCard(
    state: SimulationState,
    command: PlayerCommand,
    eventsOrDeckManager?: DomainEvent[] | DeckManager,
    maybeDeckManager?: DeckManager
  ): CommandResult {
    const externalEvents = Array.isArray(eventsOrDeckManager)
      ? eventsOrDeckManager
      : undefined;
    const deckManager = Array.isArray(eventsOrDeckManager)
      ? maybeDeckManager
      : eventsOrDeckManager;

    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    const requestedGreenId = command.greenCardId ?? command.cardId;
    if (!requestedGreenId) {
      return { success: false, message: "Green card ID is required." };
    }

    const greenEntry = (player.greenCards || []).find(
      (g) => g.id === requestedGreenId || g.card.id === requestedGreenId
    );
    if (!greenEntry) {
      return { success: false, message: "Green card not found in play." };
    }

    const targetPlayer = command.targetPlayerId
      ? state.players.get(command.targetPlayerId)
      : undefined;
    const cardName = greenEntry.card.name;
    let res: CommandResult;

    if (
      cardName === "PONY EXPRESS" ||
      cardName === "CANTEEN" ||
      cardName === "BUFFALO RIFLE" ||
      cardName === "PEPPERBOX" ||
      cardName === "DERRINGER" ||
      cardName === "KNIFE"
    ) {
      res = SingleTargetActions.handleActivateGreenCard(
        state,
        player,
        greenEntry,
        targetPlayer,
        deckManager
      );
    } else if (cardName === "HOWITZER") {
      res = AoeActions.handleHowitzer(state, player, greenEntry, deckManager);
    } else if (cardName === "CONESTOGA" || cardName === "CAN CAN") {
      if (!targetPlayer) {
        return { success: false, message: `Target required for ${cardName}.` };
      }
      res = CardManipulation.handleTheftOrDestruction(
        state,
        player,
        targetPlayer,
        greenEntry.card,
        -1,
        command.targetArea || "HAND",
        command.targetCardId,
        deckManager,
        undefined,
        greenEntry.id
      );
    } else if (GREEN_DEFENSE_ONLY.has(cardName)) {
      return {
        success: false,
        message: `${cardName} can only be activated during an attack reaction.`,
      };
    } else {
      return { success: false, message: `Unsupported green card: ${cardName}` };
    }

    if (res.success) {
      res.events = res.events || [];
      res.events.push({
        type: "CARD_PLAYED_TO_ARENA",
        payload: {
          playerId: player.id,
          playerName: player.name,
          targetPlayerId: targetPlayer?.id,
          targetPlayerName: targetPlayer?.name,
          card: greenEntry.card,
          isPlacement: false,
        },
        timestamp: Date.now(),
      });
      if (externalEvents) {
        externalEvents.push(...res.events);
      }
    }
    return res;
  }

  // Route reaction command
  public static resolveReaction(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    return ReactionResolver.resolve(state, command, deckManager);
  }

  // Route General Store draft pick
  public static resolveDraftSelection(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (!command.cardId) {
      return { success: false, message: "Card ID required to pick." };
    }
    return DraftStore.handleDraftSelect(state, player, command.cardId, deckManager);
  }

  // Prune dead or stale reactions
  public static pruneStaleReactions(state: SimulationState): void {
    ReactionResolver.pruneStaleReactions(state);
  }

  // Route character active skill
  public static executeActiveSkill(
    state: SimulationState,
    command: PlayerCommand,
    _deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    const events: DomainEvent[] = [];
    const result = ActiveSkills.handleActiveSkill(state, command, events);
    if (result && typeof result === "object" && "success" in result) {
      return result as CommandResult;
    }
    return { success: Boolean(result), events };
  }

  // Check whether target holds cards
  private static playerHasAnyCard(player: EnginePlayer): boolean {
    return (
      player.handCards.length > 0 ||
      getAllEquippedCards(player).length > 0 ||
      (player.greenCards?.length ?? 0) > 0 ||
      (player.judgements?.length ?? 0) > 0
    );
  }

  // Check Phase 2 card playability
  public static isCardPlayableInPhase2(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard
  ): boolean {
    if (player.isDead) return false;
    if (EventEngine.shouldBlockPlayCard(state, player, card)) return false;

    const others = Array.from(state.players.values()).filter(
      (p) => !p.isDead && p.id !== player.id
    );
    const hasExtraHandCard = player.handCards.some((c) => c.id !== card.id);

    const isBangSub =
      card.name === "MISSED!" &&
      SkillHooks.canSubstituteCard(player, card, "BANG", state);

    if (card.name === "BANG!" || isBangSub) {
      if (
        isBangSub &&
        EventEngine.shouldBlockPlayCard(state, player, { ...card, name: "BANG!" })
      ) {
        return false;
      }
      if (
        state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET" &&
        others.some(
          (t) =>
            getAllEquippedCards(t).length > 0 ||
            (t.greenCards?.length ?? 0) > 0 ||
            (t.judgements?.length ?? 0) > 0
        )
      ) {
        return true;
      }
      if (!BangLimiter.canPlayBang(state, player)) return false;
      return others.some(
        (t) => TargetValidator.validate(state, card, player, t).valid
      );
    }

    if (card.name === "MISSED!" || card.name === "DODGE") {
      return false;
    }

    if (card.name === "PUNCH") {
      return others.some(
        (t) =>
          TargetValidator.validate(state, card, player, t, { exactDistance: 1 })
            .valid
      );
    }

    if (card.name === "SPRINGFIELD") {
      return (
        hasExtraHandCard &&
        others.some(
          (t) =>
            TargetValidator.validate(state, card, player, t, {
              requiresRange: false,
            }).valid
        )
      );
    }

    if (card.name === "WHISKY") {
      return hasExtraHandCard;
    }

    if (card.name === "TEQUILA") {
      const anyLivingNonGhost = Array.from(state.players.values()).some(
        (p) => !p.isDead && !p.isGhost
      );
      return hasExtraHandCard && anyLivingNonGhost;
    }

    if (card.name === "BRAWL") {
      return hasExtraHandCard;
    }

    if (card.name === "RAG TIME") {
      return (
        hasExtraHandCard &&
        others.some(
          (t) =>
            this.playerHasAnyCard(t) &&
            TargetValidator.validate(state, card, player, t, {
              requiresRange: false,
            }).valid
        )
      );
    }

    if (card.name === "PANIC!") {
      return others.some(
        (t) =>
          this.playerHasAnyCard(t) &&
          TargetValidator.validate(state, card, player, t, { exactDistance: 1 })
            .valid
      );
    }

    if (card.name === "CAT BALOU") {
      return others.some(
        (t) =>
          this.playerHasAnyCard(t) &&
          TargetValidator.validate(state, card, player, t, {
            requiresRange: false,
          }).valid
      );
    }

    if (card.name === "DUEL") {
      return others.some(
        (t) =>
          TargetValidator.validate(state, card, player, t, {
            requiresRange: false,
          }).valid
      );
    }

    if (
      card.name === "BEER" ||
      card.name === "SALOON" ||
      card.name === "INDIANS!" ||
      card.name === "GATLING" ||
      card.name === "GENERAL STORE" ||
      card.name === "STAGECOACH" ||
      card.name === "WELLS FARGO"
    ) {
      return true;
    }

    if (card.name === "JAIL") {
      return others.some(
        (t) =>
          TargetValidator.validate(state, card, player, t, {
            requiresRange: false,
          }).valid
      );
    }

    if (card.name === "DYNAMITE") {
      return !player.judgements.some(
        (j) => j.type === "DYNAMITE" || j.card.name === card.name
      );
    }

    if (card.category === "weapon" || (card.border === "blue" && Boolean(card.weaponRange))) {
      return player.equipments.weapon?.name !== card.name;
    }

    if (card.border === "blue") {
      if (card.name === "MUSTANG") return !player.equipments.horseDef;
      if (card.name === "SCOPE") return !player.equipments.horseOff;
      if (card.name === "BARREL") return !player.equipments.barrel;
      return !hasEquippedCardByName(player, card.name);
    }

    if (
      card.border === "green" ||
      card.category === "green_delayed" ||
      card.category === "green_delay" ||
      card.category === "green_active"
    ) {
      return !(player.greenCards || []).some((g) => g.card.name === card.name);
    }

    return false;
  }
}
