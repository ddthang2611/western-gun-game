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

const GREEN_MISSED_CARDS = new Set([
  "BIBLE",
  "SOMBRERO",
  "IRON PLATE",
  "TEN GALLON HAT",
]);

export class TurnManager {
  // Read current turn start choice
  private static getTurnStartChoice(
    state: SimulationState
  ): PendingTurnStartChoice | null {
    return state.pendingTurnStartChoice;
  }

  // Draw single card with Mine support
  private static drawSingleWithMineSupport(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): EngineCard | undefined {
    if (
      state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE" &&
      state.discardPile.length > 0
    ) {
      const topDiscard = DeckManager.drawTopDiscard(state);
      if (topDiscard) {
        player.handCards.push(topDiscard);
        events.push({
          type: "ABANDONED_MINE_DRAW",
          payload: { playerId: player.id, cardId: topDiscard.id },
          timestamp: Date.now(),
        });
        return topDiscard;
      }
    }

    const drawRes = AtomicEffects.drawCards(state, 1);
    events.push(...drawRes.events);
    player.handCards.push(...drawRes.cards);
    return drawRes.cards[0];
  }

  // Draw multiple cards with Mine support
  private static drawCardsWithMineSupport(
    state: SimulationState,
    player: EnginePlayer,
    count: number,
    events: DomainEvent[]
  ): EngineCard[] {
    const result: EngineCard[] = [];
    for (let i = 0; i < count; i++) {
      const card = this.drawSingleWithMineSupport(state, player, events);
      if (!card) break;
      result.push(card);
    }
    return result;
  }

  // Check if player has cards in play
  private static hasCardInPlay(player: EnginePlayer): boolean {
    const eq = player.equipments || {};
    const hasEquip = Boolean(
      eq.weapon ||
        eq.horseDef ||
        eq.horseOff ||
        eq.barrel ||
        eq.extra ||
        (eq.extras && eq.extras.length > 0)
    );
    return hasEquip || player.greenCards.length > 0 || player.judgements.length > 0;
  }

  // Infer area for card in play
  private static findCardInPlayArea(
    target: EnginePlayer,
    cardId: string
  ): "EQUIPMENT" | "GREEN" | "JUDGEMENT" | undefined {
    const eq = target.equipments || {};
    const equipCards = [
      eq.weapon,
      eq.horseDef,
      eq.horseOff,
      eq.barrel,
      eq.extra,
      ...(eq.extras || []),
    ];
    if (equipCards.some((c) => c?.id === cardId)) return "EQUIPMENT";
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

    if (state.pendingTurnStartChoice || state.pendingReactions.length > 0) {
      return;
    }

    if (player.isDead) {
      this.advanceToNextTurn(state, player.id, events);
      return;
    }

    state.currentPhase = 0;
    const jRes = JudgementPhase.executePhase0(state, player, events);

    if (jRes.waitingForRescue) {
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
      const drawn = this.drawCardsWithMineSupport(state, player, 3, events);
      let extraCount = 0;
      for (let i = 0; i < ctx.postDrawBonus; i++) {
        const extra = this.drawSingleWithMineSupport(state, player, events);
        if (extra) {
          extraCount += 1;
          events.push({
            type: "EVENT_TRAIN_ARRIVAL_DRAW",
            payload: { playerId: player.id, playerName: player.name, drawnCount: 1 },
            timestamp: Date.now(),
          });
        }
      }
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 1, drawnCount: drawn.length + extraCount },
        timestamp: Date.now(),
      });
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
          const drawn = this.drawCardsWithMineSupport(state, player, count, events);
          events.push({
            type: "PHASE_CHANGED",
            payload: { phase: 1, drawnCount: drawn.length },
            timestamp: Date.now(),
          });
          this.finalizePhase1(state, player, drawn, events);
          return;
        }
        if (hasPixie) {
          const count = Math.max(1, 3 + ctx.drawDelta);
          const drawn = this.drawCardsWithMineSupport(state, player, count, events);
          events.push({
            type: "PHASE_CHANGED",
            payload: { phase: 1, drawnCount: drawn.length },
            timestamp: Date.now(),
          });
          this.finalizePhase1(state, player, drawn, events);
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
    const drawn = this.drawCardsWithMineSupport(state, player, drawCount, events);
    events.push({
      type: "PHASE_CHANGED",
      payload: { phase: 1, drawnCount: drawn.length },
      timestamp: Date.now(),
    });
    this.finalizePhase1(state, player, drawn, events);
  }

  // Open Kit Carlson preview selection
  private static startKitCarlsonPick(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    const ctx = EventRuleRegistry.buildDrawContext(state, player);
    const keepCount = Math.max(1, 2 + ctx.drawDelta);
    const { cards: previewCards, events: drawEvents } = DeckManager.drawCards(state, 3);
    events.push(...drawEvents);

    if (previewCards.length <= keepCount) {
      player.handCards.push(...previewCards);
      state.pendingPhase1Choice = null;
      events.push({
        type: "PHASE_CHANGED",
        payload: { phase: 1, drawnCount: previewCards.length },
        timestamp: Date.now(),
      });
      this.finalizePhase1(state, player, previewCards, events);
      return;
    }

    state.currentPhase = 1;
    state.pendingPhase1Choice = {
      playerId: player.id,
      mode: "KIT_CARLSON_PICK",
      options: previewCards.map((c) => c.id),
      neededCount: keepCount,
      previewCards,
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
    options?: { skipBlackJack?: boolean; ranchDone?: boolean }
  ): void {
    const ctx = EventRuleRegistry.buildDrawContext(state, player);

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
        bonusCard = this.drawSingleWithMineSupport(state, player, events);
      }

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

    if (ctx.allowLawOfTheWest && drawnCards.length >= 2) {
      const forcedCard = drawnCards[1];
      player.forcedPlayCardId = forcedCard.id;
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

    for (let i = 0; i < ctx.postDrawBonus; i++) {
      const extra = this.drawSingleWithMineSupport(state, player, events);
      if (extra) {
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
        this.finalizePhase1(state, player, drawnSoFar, events, { skipBlackJack: true });
        return { success: true, events };
      }

      const card = cards[0];
      const suit = SkillHooks.getEffectiveSuit(card, state);
      const isRed = suit === "hearts" || suit === "diamonds";
      const matched = (guess === "RED" && isRed) || (guess === "BLACK" && !isRed);

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
      this.finalizePhase1(state, player, drawnSoFar, events, { skipBlackJack: true });
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

      this.finalizePhase1(state, player, pickedCards, events);
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
        const drawn = this.drawCardsWithMineSupport(state, player, count, events);
        this.finalizePhase1(state, player, drawn, events);
        return { success: true, events };
      }

      if (option === "PIXIE_PETE") {
        state.pendingPhase1Choice = null;
        const count = Math.max(1, 3 + ctx.drawDelta);
        const drawn = this.drawCardsWithMineSupport(state, player, count, events);
        this.finalizePhase1(state, player, drawn, events);
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
        for (let i = 0; i < remainingDraws; i++) {
          const second = this.drawSingleWithMineSupport(state, player, events);
          if (second) drawn.push(second);
        }

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events);
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
        for (let i = 0; i < remainingDraws; i++) {
          const extra = this.drawSingleWithMineSupport(state, player, events);
          if (extra) drawn.push(extra);
        }

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events);
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
        let area = (command.targetArea ?? command.payload?.targetArea) as
          | "HAND"
          | "EQUIPMENT"
          | "GREEN"
          | "JUDGEMENT"
          | undefined;

        if (area === "HAND") {
          return { success: false, message: "Pat Brennan can only steal cards in play." };
        }
        if (!area && cardId) {
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
            cardName: drawn[0]?.name,
          },
          timestamp: Date.now(),
        });

        state.pendingPhase1Choice = null;
        this.finalizePhase1(state, player, drawn, events);
        return { success: true, events };
      }

      if (option === "NORMAL_DECK" || option === "NORMAL_DRAW") {
        state.pendingPhase1Choice = null;
        const drawn = this.drawCardsWithMineSupport(state, player, keepCount, events);
        this.finalizePhase1(state, player, drawn, events);
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

      if (matched.length > 0) {
        player.handCards = player.handCards.filter((c) => !idSet.has(c.id));
        for (const card of matched) {
          AtomicEffects.discardCard(state, card);
        }
        const ranchDraw = AtomicEffects.drawCards(state, matched.length);
        events.push(...ranchDraw.events);
        player.handCards.push(...ranchDraw.cards);
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
          drawnCount: matched.length,
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
        if (new Set(batchDiscardIds).size !== batchDiscardIds.length) {
          return { success: false, message: "Duplicate card IDs in discard list.", events };
        }
        for (const id of batchDiscardIds) {
          if (!player.handCards.some((c) => c.id === id)) {
            return { success: false, message: "Discard card not found in hand.", events };
          }
        }
        if (player.handCards.length - batchDiscardIds.length > handLimit) {
          const remainingExcess =
            player.handCards.length - batchDiscardIds.length - handLimit;
          return {
            success: false,
            message: `Discard ${remainingExcess} more card(s) to meet hand limit (${handLimit}).`,
            events,
          };
        }

        const removedCards: EngineCard[] = [];
        for (const id of batchDiscardIds) {
          const idx = player.handCards.findIndex((c) => c.id === id);
          if (idx !== -1) {
            const card = player.handCards.splice(idx, 1)[0];
            AtomicEffects.discardCard(state, card);
            if (player.forcedPlayCardId === card.id) {
              player.forcedPlayCardId = null;
            }
            removedCards.push(card);
            events.push({
              type: "CARD_DISCARDED_PHASE_3",
              payload: { playerId: player.id, card },
              timestamp: Date.now(),
            });
          }
        }
        SkillHooks.checkSuzyLafayette(state, player, events);
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

    // Green Missed! cards become ready on turn end; active greens wait 1 full round
    player.greenCards.forEach((g) => {
      if (GREEN_MISSED_CARDS.has(g.card.name)) {
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
    if (endRes.extraTurnGranted) {
      this.startTurn(state, player, events);
    } else {
      this.advanceToNextTurn(state, player.id, events);
    }

    return { success: true, events };
  }
}
