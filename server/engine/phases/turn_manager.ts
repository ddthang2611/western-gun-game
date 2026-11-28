import {
  SimulationState,
  EnginePlayer,
  PendingTurnStartChoice,
} from "../types/state";
import { EngineCard } from "../types/cards";
import { CommandResult, DomainEvent, PlayerCommand } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { SeatManager } from "../board/seat_manager";
import { JudgementPhase } from "./judgement_phase";
import { EventEngine } from "../events/event_engine";
import { EventRuleRegistry } from "../events/event_rule_registry";
import { SkillHooks } from "../interact/skill_hooks";
import { WinConditionEvaluator } from "../elimination/win_condition";
import { AtomicEffects } from "../interact/primitives/atomic_effects";
import { InteractManager } from "../interact/interact_manager";
import { ArenaChainManager } from "../arena/arena_chain_manager";
import { getAllEquippedCards } from "../utils/inventory";
import { CardRegistry } from "../cards/card_registry";

export class TurnManager {
  // Read current turn start choice
  private static getTurnStartChoice(
    state: SimulationState
  ): PendingTurnStartChoice | null {
    return state.pendingTurnStartChoice;
  }

  // Emit Fog-of-War Phase 1 draw event
  private static pushPhase1DrawEvent(
    player: EnginePlayer,
    drawnCards: EngineCard[],
    events: DomainEvent[],
    deckDrawnCount: number = drawnCards.length
  ): void {
    const safeDeckCount = Math.max(0, Math.min(drawnCards.length, deckDrawnCount));
    events.push({
      type: "PHASE_CHANGED",
      payload: {
        phase: 1,
        playerId: player.id,
        playerName: player.name,
        drawnCount: drawnCards.length,
        deckDrawnCount: safeDeckCount,
        drawnCards,
      },
      visibleTo: [player.id],
      maskedPayload: {
        phase: 1,
        playerId: player.id,
        playerName: player.name,
        drawnCount: drawnCards.length,
        deckDrawnCount: safeDeckCount,
      },
      timestamp: Date.now(),
    });
  }

  // Draw single card tracking deck origin
  private static drawSingleTracked(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): { card?: EngineCard; fromDeck: boolean } {
    if (
      state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE" &&
      state.discardPile.length > 0
    ) {
      const topDiscard = DeckManager.drawTopDiscard(state);
      if (topDiscard) {
        player.handCards.push(topDiscard);
        events.push({
          type: "ABANDONED_MINE_DRAW",
          payload: {
            playerId: player.id,
            playerName: player.name,
            cardId: topDiscard.id,
            card: topDiscard,
          },
          timestamp: Date.now(),
        });
        return { card: topDiscard, fromDeck: false };
      }
    }

    const drawRes = AtomicEffects.drawCards(state, 1);
    events.push(...drawRes.events);
    player.handCards.push(...drawRes.cards);
    return { card: drawRes.cards[0], fromDeck: drawRes.cards.length > 0 };
  }

  // Draw multiple cards tracking deck origin
  private static drawMultipleTracked(
    state: SimulationState,
    player: EnginePlayer,
    count: number,
    events: DomainEvent[]
  ): { cards: EngineCard[]; deckCount: number } {
    const cards: EngineCard[] = [];
    let deckCount = 0;
    for (let i = 0; i < count; i++) {
      const res = this.drawSingleTracked(state, player, events);
      if (!res.card) break;
      cards.push(res.card);
      if (res.fromDeck) deckCount += 1;
    }
    return { cards, deckCount };
  }

  // Draw single card with Mine support
  private static drawSingleWithMineSupport(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): EngineCard | undefined {
    return this.drawSingleTracked(state, player, events).card;
  }

  // Draw multiple cards with Mine support
  private static drawCardsWithMineSupport(
    state: SimulationState,
    player: EnginePlayer,
    count: number,
    events: DomainEvent[]
  ): EngineCard[] {
    return this.drawMultipleTracked(state, player, count, events).cards;
  }

  // Emit Fog-of-War CARDS_DRAWN event
  private static emitPhase1CardsDrawn(
    player: EnginePlayer,
    cards: EngineCard[],
    events: DomainEvent[],
    deckDrawnCount: number = cards.length
  ): void {
    if (cards.length === 0) return;
    const safeDeckCount = Math.max(0, Math.min(cards.length, deckDrawnCount));
    events.push({
      type: "CARDS_DRAWN",
      visibleTo: [player.id],
      payload: {
        playerId: player.id,
        playerName: player.name,
        count: cards.length,
        deckDrawnCount: safeDeckCount,
        cards,
      },
      maskedPayload: {
        playerId: player.id,
        playerName: player.name,
        count: cards.length,
        deckDrawnCount: safeDeckCount,
      },
      timestamp: Date.now(),
    });
  }

  // Execute Bill Noface or Pixie Pete draw
  private static executeSpecialPhase1CountDraw(
    state: SimulationState,
    player: EnginePlayer,
    skill: "Bill Noface" | "Pixie Pete",
    count: number,
    wounds: number,
    events: DomainEvent[]
  ): void {
    const drawRes = this.drawMultipleTracked(state, player, count, events);
    const drawn = drawRes.cards;
    events.push({
      type: "ACTIVE_SKILL_USED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        skill,
        detail:
          skill === "Bill Noface"
            ? `drew ${drawn.length} card(s) (${wounds} wound(s))`
            : `drew ${drawn.length} card(s)`,
      },
      timestamp: Date.now(),
    });
    this.finalizePhase1(state, player, drawn, events, {
      deckDrawnCount: drawRes.deckCount,
    });
  }

  // Check if player has cards in play
  private static hasCardInPlay(player: EnginePlayer): boolean {
    return (
      getAllEquippedCards(player).length > 0 ||
      player.greenCards.length > 0 ||
      player.judgements.length > 0
    );
  }

  // Infer area for card in play
  private static findCardInPlayArea(
    target: EnginePlayer,
    cardId: string
  ): "EQUIPMENT" | "GREEN" | "JUDGEMENT" | undefined {
    if (getAllEquippedCards(target).some((c) => c.id === cardId)) return "EQUIPMENT";
    if (target.greenCards.some((g) => g.id === cardId || g.card.id === cardId)) return "GREEN";
    if (target.judgements.some((j) => j.id === cardId || j.card.id === cardId)) return "JUDGEMENT";
    return undefined;
  }

  // Check dead pivot seat crossing
  private static didCrossSeat(
    state: SimulationState,
    fromId: string,
    toId: string,
    pivotId: string
  ): boolean {
    const seats = Array.from(state.players.values()).sort(
      (a, b) => a.seatIndex - b.seatIndex
    );
    const startIdx = seats.findIndex((p) => p.id === fromId);
    if (startIdx === -1 || seats.length <= 1) return false;

    const step = state.direction === -1 ? -1 : 1;
    for (let offset = 1; offset <= seats.length; offset++) {
      const idx = (((startIdx + offset * step) % seats.length) + seats.length) % seats.length;
      const seat = seats[idx];
      if (seat.id === pivotId) return true;
      if (seat.id === toId) return false;
    }
    return false;
  }

  // Start turn and turn-start hooks
  public static startTurn(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[],
    forceAdvanceRoundEvent: boolean = false
  ): void {
    state.turnPlayerId = player.id;
    state.currentPhase = 0;
    state.bangCountThisTurn = 0;
    state.docHolydayUsedThisTurn = 0;
    state.joseDelgadoCountThisTurn = 0;
    state.pendingTurnStartChoice = null;
    state.pendingPhase1Choice = null;
    player.forcedPlayCardId = null;
    player.greenCards.forEach((g) => {
      g.isDelay = false;
    });

    events.push({
      type: "TURN_STARTED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        roundNumber: state.roundNumber,
      },
      timestamp: Date.now(),
    });

    // Resolve dead Sheriff ghost/revival before advancing round event
    if (player.isDead) {
      EventEngine.resolveDeadPlayerTurnEntry(state, player, events);
    }

    // Advance event on Sheriff round boundary
    if (
      state.roundNumber >= 2 &&
      (player.id === state.sheriffId || forceAdvanceRoundEvent) &&
      !state.vendettaExtraTurnUsed
    ) {
      EventEngine.advanceRoundEvent(state, events);
    }

    const prep = EventEngine.prepareTurnStart(state, player, events);
    if (player.isDead) {
      state.pendingTurnStartChoice = null;
      if (state.pendingReactions.length > 0) {
        return;
      }
      this.advanceToNextTurn(state, player.id, events);
      return;
    }

    if (prep.needsHighNoonDamage) {
      AtomicEffects.applyDamage(state, undefined, player, 1, events);
      if (player.isDead) {
        state.pendingTurnStartChoice = null;
        this.advanceToNextTurn(state, player.id, events);
        return;
      }
      const currentChoice = this.getTurnStartChoice(state);
      if (
        currentChoice?.type === "BLOOD_BROTHERS" &&
        (player.isGhost || player.hp <= 1)
      ) {
        state.pendingTurnStartChoice = null;
        EventEngine.maybeQueueVeraOrBloodBrothers(state, player, false);
      }
    }

    if (prep.fistfulBangCount > 0 && !player.isDead) {
      state.pendingReactions.push(
        ...EventEngine.createFistfulBangReactions(state, player, prep.fistfulBangCount)
      );
    }

    if (
      state.pendingReactions.length > 0 ||
      prep.pausedForChoice ||
      this.getTurnStartChoice(state) !== null
    ) {
      return;
    }

    this.continueTurnAfterTurnStart(state, player, events);
  }

  // Resume Phase 0 and Phase 1
  public static continueTurnAfterTurnStart(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    if (state.gameOver) return;

    const winCheck = WinConditionEvaluator.evaluate(state);
    if (winCheck.gameOver) {
      state.gameOver = {
        winner: winCheck.winner,
        message: winCheck.message || "",
      };
      state.matchPhase = "FINISHED";
      if (!events.some((e) => e.type === "GAME_OVER")) {
        events.push({
          type: "GAME_OVER",
          payload: {
            winner: winCheck.winner,
            message: winCheck.message,
          },
          timestamp: Date.now(),
        });
      }
      return;
    }

    if (
      state.pendingTurnStartChoice ||
      state.pendingReactions.length > 0 ||
      state.activeChain.length > 0
    ) {
      return;
    }

    if (player.isDead) {
      this.advanceToNextTurn(state, player.id, events);
      return;
    }

    state.currentPhase = 0;
    const jRes = JudgementPhase.executePhase0(state, player, events);

    if (jRes.waitingForRescue || state.activeChain.length > 0) {
      return;
    }

    if (jRes.playerDied) {
      this.advanceToNextTurn(state, player.id, events);
      return;
    }

    if (jRes.turnSkipped) {
      events.push({
        type: "TURN_SKIPPED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          reason: "JAIL",
        },
        timestamp: Date.now(),
      });
      this.advanceToNextTurn(state, player.id, events);
      return;
    }

    this.executePhase1(state, player, events);
  }

  // Execute Phase 1 draw logic
  public static executePhase1(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    state.currentPhase = 1;
    const ctx = EventRuleRegistry.buildDrawContext(state, player);

    // Priority 1: Ghost Town or Peyote override
    if (ctx.overrideMode === "GHOST_TOWN") {
      const ghostRes = this.drawMultipleTracked(state, player, 3, events);
      const drawn = ghostRes.cards;
      const extraCards: EngineCard[] = [];
      let extraDeckCount = 0;
      for (let i = 0; i < ctx.postDrawBonus; i++) {
        const extra = this.drawSingleTracked(state, player, events);
        if (extra.card) {
          extraCards.push(extra.card);
          if (extra.fromDeck) extraDeckCount += 1;
          events.push({
            type: "EVENT_TRAIN_ARRIVAL_DRAW",
            payload: { playerId: player.id, playerName: player.name, drawnCount: 1 },
            timestamp: Date.now(),
          });
        }
      }
      this.pushPhase1DrawEvent(player, drawn, events, ghostRes.deckCount);
      if (extraCards.length > 0) {
        this.emitPhase1CardsDrawn(player, extraCards, events, extraDeckCount);
      }
      state.pendingPhase1Choice = null;
      state.currentPhase = 2;
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 2 },
        timestamp: Date.now(),
      });
      return;
    }

    if (ctx.overrideMode === "PEYOTE_GUESS") {
      state.pendingPhase1Choice = {
        playerId: player.id,
        mode: "PEYOTE_GUESS",
        options: ["RED", "BLACK"],
        drawnSoFar: [],
      };
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 1, mode: "PEYOTE_GUESS" },
        timestamp: Date.now(),
      });
      return;
    }

    const hasKit = SkillHooks.hasSkill(player, "Kit Carlson", state);
    const hasBill = SkillHooks.hasSkill(player, "Bill Noface", state);
    const hasPat = SkillHooks.hasSkill(player, "Pat Brennan", state);
    const hasPixie = SkillHooks.hasSkill(player, "Pixie Pete", state);
    const canPatSteal =
      hasPat &&
      SeatManager.getAlivePlayers(state, false).some(
        (p) => p.id !== player.id && !p.isGhost && this.hasCardInPlay(p)
      );

    const exclusiveOptions: string[] = [];
    if (hasKit) exclusiveOptions.push("KIT_CARLSON");
    if (hasBill) exclusiveOptions.push("BILL_NOFACE");
    if (hasPixie) exclusiveOptions.push("PIXIE_PETE");
    if (canPatSteal) exclusiveOptions.push("PAT_BRENNAN_STEAL");

    const hasHardLiquor = ctx.allowHardLiquorHeal && player.hp < player.maxHp;
    const hasPedro =
      SkillHooks.hasSkill(player, "Pedro Ramirez", state) &&
      state.discardPile.length > 0 &&
      ctx.allowPedroDiscardDraw &&
      exclusiveOptions.length === 0;
    const hasJesse =
      SkillHooks.hasSkill(player, "Jesse Jones", state) &&
      SeatManager.getAlivePlayers(state, false).some(
        (p) => p.id !== player.id && !p.isGhost && p.handCards.length > 0
      );

    const options: string[] = [];

    if (exclusiveOptions.length >= 2) {
      options.push(...exclusiveOptions);
      if (hasJesse) options.push("JESSE_STEAL_AND_DECK");
      if (hasHardLiquor) options.push("SKIP_DRAW_HEAL");
    } else if (canPatSteal) {
      options.push("PAT_BRENNAN_STEAL");
      if (hasJesse) options.push("JESSE_STEAL_AND_DECK");
      options.push("NORMAL_DRAW");
      if (hasHardLiquor) options.push("SKIP_DRAW_HEAL");
    } else if (exclusiveOptions.length === 1) {
      if (hasHardLiquor || hasJesse) {
        options.push(exclusiveOptions[0]);
        if (hasJesse) options.push("JESSE_STEAL_AND_DECK");
        if (hasHardLiquor) options.push("SKIP_DRAW_HEAL");
      } else {
        if (hasKit) {
          this.startKitCarlsonPick(state, player, events);
          return;
        }
        if (hasBill) {
          const wounds = Math.max(0, player.maxHp - player.hp);
          const count = Math.max(1, 1 + wounds + ctx.drawDelta);
          this.executeSpecialPhase1CountDraw(
            state,
            player,
            "Bill Noface",
            count,
            wounds,
            events
          );
          return;
        }
        if (hasPixie) {
          const count = Math.max(1, 3 + ctx.drawDelta);
          this.executeSpecialPhase1CountDraw(
            state,
            player,
            "Pixie Pete",
            count,
            0,
            events
          );
          return;
        }
      }
    } else {
      if (hasPedro) options.push("PEDRO_DISCARD_AND_DECK");
      if (hasJesse) options.push("JESSE_STEAL_AND_DECK");
      if (hasHardLiquor) options.push("SKIP_DRAW_HEAL");
      if (options.length > 0) {
        options.push("NORMAL_DECK");
      }
    }

    if (options.length > 0) {
      state.pendingPhase1Choice = {
        playerId: player.id,
        mode: "CHOOSE_DRAW_OPTION",
        options,
      };
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 1, mode: "CHOOSE_DRAW_OPTION", options },
        timestamp: Date.now(),
      });
      return;
    }

    const drawCount = Math.max(1, 2 + ctx.drawDelta);
    const drawRes = this.drawMultipleTracked(state, player, drawCount, events);
    this.finalizePhase1(state, player, drawRes.cards, events, {
      deckDrawnCount: drawRes.deckCount,
    });
  }

  // Open Kit Carlson preview selection
  private static startKitCarlsonPick(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    const ctx = EventRuleRegistry.buildDrawContext(state, player);
    const keepCount = Math.max(1, 2 + ctx.drawDelta);
    const previewRes = this.drawMultipleTracked(state, player, 3, events);
    const previewCards = previewRes.cards;

    if (previewCards.length <= keepCount) {
      state.pendingPhase1Choice = null;
      this.finalizePhase1(state, player, previewCards, events, {
        deckDrawnCount: previewRes.deckCount,
      });
      return;
    }

    if (previewCards.length > 0) {
      player.handCards.splice(
        player.handCards.length - previewCards.length,
        previewCards.length
      );
    }

    state.currentPhase = 1;
    state.pendingPhase1Choice = {
      playerId: player.id,
      mode: "KIT_CARLSON_PICK",
      options: previewCards.map((c) => c.id),
      neededCount: keepCount,
      previewCards,
      remainingBaseDraws: previewRes.deckCount,
    };
    events.push({
      type: "PHASE_CHANGED",
      payload: { phase: 1, mode: "KIT_CARLSON_PICK" },
      timestamp: Date.now(),
    });
  }

  // Finalize Phase 1 post-draw triggers
  public static finalizePhase1(
    state: SimulationState,
    player: EnginePlayer,
    drawnCards: EngineCard[],
    events: DomainEvent[],
    options?: {
      skipBlackJack?: boolean;
      ranchDone?: boolean;
      deckDrawnCount?: number;
      secondCardFromDeck?: boolean;
    }
  ): void {
    const ctx = EventRuleRegistry.buildDrawContext(state, player);
    const allDrawn = [...drawnCards];
    let deckFlightCount = options?.deckDrawnCount ?? drawnCards.length;
    const secondFromDeck =
      options?.secondCardFromDeck ??
      (drawnCards.length >= 2 && deckFlightCount >= 1);
    let secondRevealedInArena = false;

    if (
      !options?.skipBlackJack &&
      !ctx.disableSecondCardTrigger &&
      drawnCards.length >= 2 &&
      SkillHooks.hasSkill(player, "Black Jack", state)
    ) {
      const secondCard = drawnCards[1];
      const effectiveSuit = SkillHooks.getEffectiveSuit(secondCard, state);
      const isRed = effectiveSuit === "hearts" || effectiveSuit === "diamonds";
      let bonusCard: EngineCard | undefined;
      if (isRed) {
        const bonusRes = this.drawSingleTracked(state, player, events);
        bonusCard = bonusRes.card;
        if (bonusCard) {
          allDrawn.push(bonusCard);
          if (bonusRes.fromDeck) {
            deckFlightCount += 1;
          }
        }
      }

      ArenaChainManager.appendBatch(state, [
        {
          kind: "REVEAL_CARD",
          card: secondCard,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: secondFromDeck ? "DECK" : "DISCARD",
          destinationZone: "HAND",
          destinationPlayerId: player.id,
          actionLabel: bonusCard ? "Black Jack (+1 Bonus)" : "Black Jack Reveal",
        },
      ]);
      secondRevealedInArena = true;

      events.push({
        type: "BLACK_JACK_REVEAL",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: secondCard,
          effectiveSuit,
          bonusDrawn: Boolean(bonusCard),
        },
        timestamp: Date.now(),
      });
    }

    const willRevealLaw = ctx.allowLawOfTheWest && drawnCards.length >= 2;
    if ((secondRevealedInArena || willRevealLaw) && secondFromDeck) {
      deckFlightCount = Math.max(0, deckFlightCount - 1);
    }

    if (allDrawn.length > 0) {
      this.pushPhase1DrawEvent(player, allDrawn, events, deckFlightCount);
    }

    if (willRevealLaw) {
      const forcedCard = drawnCards[1];
      player.forcedPlayCardId = forcedCard.id;
      if (!secondRevealedInArena) {
        ArenaChainManager.appendBatch(state, [
          {
            kind: "REVEAL_CARD",
            card: forcedCard,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: secondFromDeck ? "DECK" : "DISCARD",
            destinationZone: "HAND",
            destinationPlayerId: player.id,
            actionLabel: "Law of the West",
          },
        ]);
      }
      events.push({
        type: "LAW_OF_THE_WEST_REVEAL",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: forcedCard,
        },
        timestamp: Date.now(),
      });
    }

    const trainBonusCards: EngineCard[] = [];
    let trainDeckCount = 0;
    for (let i = 0; i < ctx.postDrawBonus; i++) {
      const extra = this.drawSingleTracked(state, player, events);
      if (extra.card) {
        trainBonusCards.push(extra.card);
        if (extra.fromDeck) {
          trainDeckCount += 1;
        }
        events.push({
          type: "EVENT_TRAIN_ARRIVAL_DRAW",
          payload: {
            playerId: player.id,
            playerName: player.name,
            drawnCount: 1,
          },
          timestamp: Date.now(),
        });
      }
    }
    if (trainBonusCards.length > 0) {
      this.emitPhase1CardsDrawn(player, trainBonusCards, events, trainDeckCount);
    }

    if (
      ctx.allowRanchExchange &&
      !options?.ranchDone &&
      player.handCards.length > 0
    ) {
      state.currentPhase = 1;
      state.pendingPhase1Choice = {
        playerId: player.id,
        mode: "RANCH_EXCHANGE",
        options: ["DISCARD_AND_DRAW", "SKIP"],
        ranchUsed: true,
      };
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 1, mode: "RANCH_EXCHANGE" },
        timestamp: Date.now(),
      });
      return;
    }

    state.pendingPhase1Choice = null;
    state.currentPhase = 2;
    events.push({
      type: "PHASE_CHANGED",
      payload: { phase: 2 },
      timestamp: Date.now(),
    });
  }

  // Resolve interactive Phase 1 choice
  public static resolvePhase1Choice(
    state: SimulationState,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    const choiceState = state.pendingPhase1Choice;
    if (!choiceState) {
      return { success: false, message: "No pending Phase 1 choice." };
    }
    if (choiceState.playerId !== command.playerId) {
      return { success: false, message: "Phase 1 choice belongs to another player." };
    }

    const player = state.players.get(command.playerId);
    if (!player || player.isDead) {
      return { success: false, message: "Player not found or eliminated." };
    }

    const ctx = EventRuleRegistry.buildDrawContext(state, player);
    const keepCount = Math.max(1, 2 + ctx.drawDelta);

    if (choiceState.mode === "PEYOTE_GUESS") {
      const guess = String(
        command.payload?.choice ?? command.payload?.guess ?? ""
      ).toUpperCase();
      if (guess !== "RED" && guess !== "BLACK") {
        return { success: false, message: "Peyote guess must be RED or BLACK." };
      }

      const { cards, events: drawEvents } = DeckManager.drawCards(state, 1);
      events.push(...drawEvents);
      const drawnSoFar = [...(choiceState.drawnSoFar || [])];

      if (cards.length === 0) {
        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawnSoFar, events, {
          skipBlackJack: true,
          deckDrawnCount: 0,
          secondCardFromDeck: false,
        });
        return { success: true, events };
      }

      const card = cards[0];
      const suit = SkillHooks.getEffectiveSuit(card, state);
      const isRed = suit === "hearts" || suit === "diamonds";
      const matched = (guess === "RED" && isRed) || (guess === "BLACK" && !isRed);

      ArenaChainManager.appendBatch(state, [
        {
          kind: "CHECK_RESULT",
          card,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: "DECK",
          destinationZone: matched ? "HAND" : "DISCARD",
          destinationPlayerId: matched ? player.id : undefined,
          actionLabel: `Peyote ${guess} (${matched ? "CORRECT" : "WRONG"})`,
          outcome: matched ? "CORRECT" : "WRONG",
        },
      ]);

      events.push({
        type: "EVENT_PEYOTE_GUESS",
        payload: {
          playerId: player.id,
          playerName: player.name,
          choice: guess,
          card,
          effectiveSuit: suit,
          matched,
        },
        timestamp: Date.now(),
      });

      if (matched) {
        player.handCards.push(card);
        drawnSoFar.push(card);
        choiceState.drawnSoFar = drawnSoFar;
        return { success: true, events };
      }

      if (state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE") {
        DeckManager.placeOnTopOfDeck(state, card);
      } else {
        DeckManager.discardCard(state, card);
      }

      state.pendingPhase1Choice = null;
      this.finalizePhase1(state, player, drawnSoFar, events, {
        skipBlackJack: true,
        deckDrawnCount: 0,
        secondCardFromDeck: false,
      });
      return { success: true, events };
    }

    if (choiceState.mode === "KIT_CARLSON_PICK") {
      const previewCards = choiceState.previewCards || [];
      const neededCount = Math.min(keepCount, previewCards.length);
      const rawIds: unknown =
        command.payload?.cardIds ??
        command.discardCardIds ??
        (command.cardId ? [command.cardId] : []);

      if (!Array.isArray(rawIds) || rawIds.length !== neededCount) {
        return {
          success: false,
          message: `Must choose exactly ${neededCount} card(s) for Kit Carlson.`,
        };
      }

      const pickedIds = rawIds.map(String);
      if (new Set(pickedIds).size !== neededCount) {
        return { success: false, message: "Selected card IDs must be distinct." };
      }

      const pickedSet = new Set(pickedIds);
      const pickedCards = previewCards.filter((c) => pickedSet.has(c.id));
      if (pickedCards.length !== neededCount) {
        return { success: false, message: "Selected cards not found in Kit Carlson preview." };
      }

      const remainingCards = previewCards.filter((c) => !pickedSet.has(c.id));
      player.handCards.push(...pickedCards);
      for (const rem of remainingCards) {
        DeckManager.placeOnTopOfDeck(state, rem);
      }

      state.pendingPhase1Choice = null;
      events.push({
        type: "KIT_CARLSON_PICKED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          pickedCount: pickedCards.length,
        },
        timestamp: Date.now(),
      });

      const kitDeckCount = Math.min(
        pickedCards.length,
        choiceState.remainingBaseDraws ?? pickedCards.length
      );
      this.finalizePhase1(state, player, pickedCards, events, {
        deckDrawnCount: kitDeckCount,
      });
      return { success: true, events };
    }

    if (choiceState.mode === "CHOOSE_DRAW_OPTION") {
      const rawOption = String(
        command.payload?.choice ?? command.payload?.option ?? ""
      );
      const option =
        rawOption === "PAT_BRENNAN" &&
        choiceState.options.includes("PAT_BRENNAN_STEAL")
          ? "PAT_BRENNAN_STEAL"
          : (rawOption === "NORMAL_DRAW" || rawOption === "NORMAL_DECK") &&
            !choiceState.options.includes(rawOption)
          ? choiceState.options.find(
              (o) => o === "NORMAL_DRAW" || o === "NORMAL_DECK"
            ) || rawOption
          : rawOption;

      if (!choiceState.options.includes(option)) {
        return { success: false, message: `Invalid draw option: ${rawOption}` };
      }

      if (option === "SKIP_DRAW_HEAL") {
        if (!ctx.allowHardLiquorHeal || player.hp >= player.maxHp) {
          return { success: false, message: "Cannot use Hard Liquor heal right now." };
        }
        player.hp = Math.min(player.maxHp, player.hp + 1);
        state.pendingPhase1Choice = null;
        state.currentPhase = 2;
        events.push({
          type: "EVENT_HARD_LIQUOR_HEAL",
          payload: {
            playerId: player.id,
            playerName: player.name,
            currentHp: player.hp,
            maxHp: player.maxHp,
          },
          timestamp: Date.now(),
        });
        events.push({
          type: "PHASE_CHANGED",
          payload: { phase: 2 },
          timestamp: Date.now(),
        });
        return { success: true, events };
      }

      if (option === "KIT_CARLSON") {
        this.startKitCarlsonPick(state, player, events);
        return { success: true, events };
      }

      if (option === "BILL_NOFACE") {
        state.pendingPhase1Choice = null;
        const wounds = Math.max(0, player.maxHp - player.hp);
        const count = Math.max(1, 1 + wounds + ctx.drawDelta);
        this.executeSpecialPhase1CountDraw(
          state,
          player,
          "Bill Noface",
          count,
          wounds,
          events
        );
        return { success: true, events };
      }

      if (option === "PIXIE_PETE") {
        state.pendingPhase1Choice = null;
        const count = Math.max(1, 3 + ctx.drawDelta);
        this.executeSpecialPhase1CountDraw(
          state,
          player,
          "Pixie Pete",
          count,
          0,
          events
        );
        return { success: true, events };
      }

      if (option === "PEDRO_DISCARD_AND_DECK") {
        const topDiscard = DeckManager.drawTopDiscard(state);
        if (!topDiscard) {
          return { success: false, message: "Discard pile is empty." };
        }
        player.handCards.push(topDiscard);
        events.push({
          type: "PEDRO_RAMIREZ_DRAW",
          payload: {
            playerId: player.id,
            playerName: player.name,
            card: topDiscard,
          },
          timestamp: Date.now(),
        });

        const drawn: EngineCard[] = [topDiscard];
        const remainingDraws = Math.max(0, keepCount - 1);
        let secondFromDeck = false;
        let extraDeckCount = 0;
        for (let i = 0; i < remainingDraws; i++) {
          const second = this.drawSingleTracked(state, player, events);
          if (second.card) {
            drawn.push(second.card);
            if (second.fromDeck) {
              extraDeckCount += 1;
              if (i === 0) secondFromDeck = true;
            }
          }
        }

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events, {
          deckDrawnCount: extraDeckCount,
          secondCardFromDeck: secondFromDeck,
        });
        return { success: true, events };
      }

      if (option === "JESSE_STEAL_AND_DECK") {
        const targetId = command.targetPlayerId ?? command.payload?.targetPlayerId;
        const target = targetId ? state.players.get(targetId) : undefined;
        if (
          !target ||
          target.id === player.id ||
          target.isDead ||
          target.isGhost ||
          target.handCards.length === 0
        ) {
          return {
            success: false,
            message: "Target player must be alive and have cards in hand.",
          };
        }

        const beforeLen = player.handCards.length;
        const ok = AtomicEffects.stealCard(
          state,
          player,
          target,
          "HAND",
          undefined,
          events
        );
        if (!ok) {
          return { success: false, message: "Failed to steal card from target hand." };
        }

        const drawn: EngineCard[] = [];
        if (player.handCards.length > beforeLen) {
          drawn.push(player.handCards[player.handCards.length - 1]);
        }

        events.push({
          type: "JESSE_JONES_STEAL",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetPlayerId: target.id,
            targetPlayerName: target.name,
          },
          timestamp: Date.now(),
        });

        const remainingDraws = Math.max(0, keepCount - 1);
        let secondFromDeck = false;
        let extraDeckCount = 0;
        for (let i = 0; i < remainingDraws; i++) {
          const extra = this.drawSingleTracked(state, player, events);
          if (extra.card) {
            drawn.push(extra.card);
            if (extra.fromDeck) {
              extraDeckCount += 1;
              if (i === 0) secondFromDeck = true;
            }
          }
        }

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events, {
          deckDrawnCount: extraDeckCount,
          secondCardFromDeck: secondFromDeck,
        });
        return { success: true, events };
      }

      if (option === "PAT_BRENNAN_STEAL") {
        const targetId = command.targetPlayerId ?? command.payload?.targetPlayerId;
        const target = targetId ? state.players.get(targetId) : undefined;
        if (!target || target.isDead || target.isGhost) {
          return { success: false, message: "Invalid target player for Pat Brennan." };
        }

        const cardId =
          command.targetCardId ?? command.cardId ?? command.payload?.targetCardId;
        if (!cardId) {
          return { success: false, message: "Target card ID in play is required." };
        }
        let area = (command.targetArea ?? command.payload?.targetArea) as
          | "HAND"
          | "EQUIPMENT"
          | "GREEN"
          | "JUDGEMENT"
          | undefined;

        if (area === "HAND") {
          return { success: false, message: "Pat Brennan can only steal cards in play." };
        }
        if (!area) {
          area = this.findCardInPlayArea(target, cardId);
        }
        if (!area) {
          return { success: false, message: "Target card area in play is required." };
        }

        const beforeLen = player.handCards.length;
        const ok = AtomicEffects.stealCard(
          state,
          player,
          target,
          area,
          cardId,
          events
        );
        if (!ok) {
          return { success: false, message: "Target card in play was not found." };
        }

        const drawn: EngineCard[] = [];
        if (player.handCards.length > beforeLen) {
          drawn.push(player.handCards[player.handCards.length - 1]);
        }

        events.push({
          type: "PAT_BRENNAN_STEAL",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            targetArea: area,
            card: drawn[0],
            cardName: drawn[0]?.name,
          },
          timestamp: Date.now(),
        });

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events, {
          deckDrawnCount: 0,
          secondCardFromDeck: false,
        });
        return { success: true, events };
      }

      if (option === "NORMAL_DECK" || option === "NORMAL_DRAW") {
        state.pendingPhase1Choice = null;
        const drawRes = this.drawMultipleTracked(state, player, keepCount, events);
        this.finalizePhase1(state, player, drawRes.cards, events, {
          deckDrawnCount: drawRes.deckCount,
        });
        return { success: true, events };
      }
    }

    if (choiceState.mode === "RANCH_EXCHANGE") {
      const isSkip =
        command.payload?.skip === true ||
        String(command.payload?.choice ?? "").toUpperCase() === "SKIP";
      const discardIds: string[] = isSkip
        ? []
        : Array.isArray(command.discardCardIds)
        ? command.discardCardIds
        : Array.isArray(command.payload?.discardCardIds)
        ? command.payload.discardCardIds
        : [];

      if (new Set(discardIds).size !== discardIds.length) {
        return { success: false, message: "Duplicate card IDs in Ranch exchange." };
      }

      const idSet = new Set(discardIds);
      const matched = player.handCards.filter((c) => idSet.has(c.id));
      if (matched.length !== discardIds.length) {
        return { success: false, message: "One or more selected cards not in hand." };
      }

      let drawnCount = 0;
      if (matched.length > 0) {
        player.handCards = player.handCards.filter((c) => !idSet.has(c.id));
        for (const card of matched) {
          AtomicEffects.discardCard(state, card);
        }
        ArenaChainManager.appendBatch(
          state,
          matched.map((card) => ({
            kind: "DISCARD_CARD" as const,
            card,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: "HAND" as const,
            destinationZone: "DISCARD" as const,
            actionLabel: "Ranch Discard",
          }))
        );
        const ranchDraw = AtomicEffects.drawCards(state, matched.length);
        events.push(...ranchDraw.events);
        player.handCards.push(...ranchDraw.cards);
        drawnCount = ranchDraw.cards.length;
        if (player.handCards.length === 0) {
          SkillHooks.checkSuzyLafayette(state, player, events);
        }
      }

      events.push({
        type: "EVENT_RANCH_EXCHANGE",
        payload: {
          playerId: player.id,
          playerName: player.name,
          discardedCount: matched.length,
          drawnCount,
        },
        timestamp: Date.now(),
      });

      state.pendingPhase1Choice = null;
      state.currentPhase = 2;
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 2 },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    return { success: false, message: "Unsupported Phase 1 choice mode." };
  }

  // Advance to next eligible turn
  public static advanceToNextTurn(
    state: SimulationState,
    currentPlayerId: string,
    events: DomainEvent[]
  ): void {
    if (state.gameOver) return;

    const winCheck = WinConditionEvaluator.evaluate(state);
    if (winCheck.gameOver) {
      state.gameOver = {
        winner: winCheck.winner,
        message: winCheck.message || "",
      };
      state.matchPhase = "FINISHED";
      if (!events.some((e) => e.type === "GAME_OVER")) {
        events.push({
          type: "GAME_OVER",
          payload: {
            winner: winCheck.winner,
            message: winCheck.message,
          },
          timestamp: Date.now(),
        });
      }
      return;
    }

    state.vendettaExtraTurnUsed = false;

    const nextPlayer = SeatManager.getNextTurnPlayer(state, currentPlayerId);
    if (!nextPlayer) return;

    const sheriffPlayer = state.players.get(state.sheriffId);
    const sheriffEligible = Boolean(
      sheriffPlayer &&
        (!sheriffPlayer.isDead ||
          state.activeEvent?.effectCode === "EVENT_HN_GHOST_TOWN" ||
          (state.activeEvent?.effectCode === "EVENT_FOC_DEAD_MAN" &&
            state.firstEliminatedPlayerId === sheriffPlayer.id))
    );

    let forceAdvanceRoundEvent = false;
    if (nextPlayer.id === state.sheriffId) {
      state.roundNumber += 1;
    } else if (
      sheriffPlayer &&
      !sheriffEligible &&
      this.didCrossSeat(state, currentPlayerId, nextPlayer.id, state.sheriffId)
    ) {
      state.roundNumber += 1;
      forceAdvanceRoundEvent = true;
    }

    this.startTurn(state, nextPlayer, events, forceAdvanceRoundEvent);
  }

  // Shared Phase 3 excess discard helper
  public static discardExcessPhase3Cards(
    state: SimulationState,
    player: EnginePlayer,
    targetIds: string[],
    events: DomainEvent[],
    options?: { requireExactToLimit?: boolean }
  ): CommandResult {
    if (player.isGhost) {
      return {
        success: false,
        message: "Ghosts do not have a Phase 3 hand limit.",
        events,
      };
    }
    if (targetIds.length === 0) {
      return { success: false, message: "Card ID required to discard.", events };
    }
    if (new Set(targetIds).size !== targetIds.length) {
      return {
        success: false,
        message: "Duplicate card IDs cannot be discarded together.",
        events,
      };
    }

    for (const id of targetIds) {
      if (!player.handCards.some((c) => c.id === id)) {
        return { success: false, message: "Card not found in hand.", events };
      }
    }

    const handLimit = SkillHooks.getPhase3HandLimit(player, state);
    const excess = player.handCards.length - handLimit;
    if (excess <= 0) {
      return {
        success: false,
        message: `Hand size (${player.handCards.length}) does not exceed hand limit (${handLimit}).`,
        events,
      };
    }
    if (targetIds.length > excess) {
      return {
        success: false,
        message: `Can discard at most ${excess} excess card(s) (hand limit ${handLimit}).`,
        events,
      };
    }
    if (options?.requireExactToLimit && targetIds.length < excess) {
      return {
        success: false,
        message: `Discard ${excess - targetIds.length} more card(s) to meet hand limit (${handLimit}).`,
        events,
      };
    }

    const discardedBatch: EngineCard[] = [];
    for (const id of targetIds) {
      const idx = player.handCards.findIndex((c) => c.id === id);
      if (idx !== -1) {
        const card = player.handCards.splice(idx, 1)[0];
        AtomicEffects.discardCard(state, card, undefined, "PHASE_3_EXCESS");
        discardedBatch.push(card);
        if (player.forcedPlayCardId === card.id) {
          player.forcedPlayCardId = null;
        }
        events.push({
          type: "CARD_DISCARDED_PHASE_3",
          payload: { playerId: player.id, card },
          timestamp: Date.now(),
        });
      }
    }

    if (discardedBatch.length > 0) {
      ArenaChainManager.appendBatch(
        state,
        discardedBatch.map((card) => ({
          kind: "DISCARD_CARD" as const,
          card,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: "HAND" as const,
          destinationZone: "DISCARD" as const,
          actionLabel: `Discard (${card.name})`,
        }))
      );
    }

    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  // End turn or Phase 3
  public static endTurn(
    state: SimulationState,
    commandOrPlayer: PlayerCommand | EnginePlayer,
    events: DomainEvent[] = []
  ): CommandResult {
    const playerId =
      "playerId" in commandOrPlayer ? commandOrPlayer.playerId : commandOrPlayer.id;
    const player = state.players.get(playerId);

    if (!player) {
      return { success: false, message: "Player not found.", events };
    }
    if (state.turnPlayerId !== player.id) {
      return { success: false, message: "It is not your turn.", events };
    }
    if (state.currentPhase !== 2 && state.currentPhase !== 3) {
      return {
        success: false,
        message: "Can only end turn during Phase 2 or Phase 3.",
        events,
      };
    }
    if (state.pendingReactions.length > 0) {
      return {
        success: false,
        message: "Cannot end turn while reactions remain pending.",
        events,
      };
    }
    if (state.activeChain.length > 0) {
      return {
        success: false,
        message: "Cannot end turn while draft resolution is active.",
        events,
      };
    }
    if (state.pendingTurnStartChoice || state.pendingPhase1Choice) {
      return {
        success: false,
        message: "Resolve pending turn choice before ending turn.",
        events,
      };
    }

    if (player.forcedPlayCardId) {
      const forcedCard = player.handCards.find((c) => c.id === player.forcedPlayCardId);
      if (forcedCard && InteractManager.isCardPlayableInPhase2(state, player, forcedCard)) {
        return {
          success: false,
          message:
            "Law of the West: you must play the revealed card before ending your turn",
          events,
        };
      }
    }

    const batchDiscardIds =
      "discardCardIds" in commandOrPlayer && Array.isArray(commandOrPlayer.discardCardIds)
        ? commandOrPlayer.discardCardIds
        : undefined;

    if (!player.isGhost) {
      const handLimit = SkillHooks.getPhase3HandLimit(player, state);

      if (batchDiscardIds && batchDiscardIds.length > 0) {
        const discardRes = this.discardExcessPhase3Cards(
          state,
          player,
          batchDiscardIds,
          events,
          { requireExactToLimit: true }
        );
        if (!discardRes.success) {
          return discardRes;
        }
      }

      if (player.handCards.length > handLimit) {
        const excess = player.handCards.length - handLimit;
        if (state.currentPhase !== 3) {
          state.currentPhase = 3;
          events.push({
            type: "PHASE_CHANGED",
            payload: { phase: 3, handLimit, excess },
            timestamp: Date.now(),
          });
          return { success: true, events };
        }
        return {
          success: false,
          message: `Hand limit exceeded: discard ${excess} excess card(s) (limit ${handLimit}).`,
          events,
        };
      }
    }

    // Ready defense greens on turn end
    player.greenCards.forEach((g) => {
      if (CardRegistry.isGreenDefenseCard(g.card)) {
        g.isDelay = false;
      }
    });
    player.forcedPlayCardId = null;
    state.currentPhase = 3;

    events.push({
      type: "TURN_ENDED",
      payload: { playerId: player.id, playerName: player.name },
      timestamp: Date.now(),
    });

    const endRes = EventEngine.onTurnEnd(state, player, events);
    if (endRes.pendingInteraction) {
      return { success: true, events };
    }
    if (endRes.extraTurnGranted) {
      this.startTurn(state, player, events);
    } else {
      this.advanceToNextTurn(state, player.id, events);
    }

    return { success: true, events };
  }
}
