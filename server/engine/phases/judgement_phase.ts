import { SimulationState, EnginePlayer } from "../types/state";
import { ActiveJudgement, EngineCard } from "../types/cards";
import { DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { SeatManager } from "../board/seat_manager";
import { SkillHooks } from "../interact/skill_hooks";
import { AtomicEffects } from "../interact/primitives/atomic_effects";
import { ArenaChainManager } from "../arena/arena_chain_manager";

export interface JudgementPhaseResult {
  turnSkipped: boolean;
  playerDied: boolean;
  waitingForRescue: boolean;
}

const DYNAMITE_RANKS = new Set(["2", "3", "4", "5", "6", "7", "8", "9"]);

export class JudgementPhase {
  // Check Dynamite explosion condition
  public static isDynamiteExploded(card: EngineCard, state?: SimulationState): boolean {
    return (
      SkillHooks.getEffectiveSuit(card, state) === "spades" &&
      DYNAMITE_RANKS.has(card.rank)
    );
  }

  // Check Jail escape condition
  public static isJailEscaped(card: EngineCard, state?: SimulationState): boolean {
    return SkillHooks.getEffectiveSuit(card, state) === "hearts";
  }

  // Discard card respecting Abandoned Mine
  private static discardJudgementCard(state: SimulationState, card: EngineCard): void {
    if (state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE") {
      DeckManager.placeOnTopOfDeck(state, card);
    } else {
      DeckManager.discardCard(state, card);
    }
  }

  // Resolve Dynamite judgement outcome
  public static resolveDynamiteOutcome(
    state: SimulationState,
    player: EnginePlayer,
    judgementCard: EngineCard,
    judgementId: string,
    chosenCard: EngineCard | undefined,
    drawnCards: EngineCard[],
    events: DomainEvent[],
    deckManager?: DeckManager
  ): JudgementPhaseResult {
    const exploded = Boolean(chosenCard && this.isDynamiteExploded(chosenCard, state));

    const dynArenaEntries = ArenaChainManager.appendBatch(state, [
      {
        kind: "CHECK_SOURCE",
        card: judgementCard,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "JUDGEMENT",
        destinationZone: exploded ? "DISCARD" : "JUDGEMENT",
        actionLabel: "DYNAMITE Judgement",
      },
      ...drawnCards.map((drawnCard) => {
        const cardExploded = this.isDynamiteExploded(drawnCard, state);
        return {
          kind: "CHECK_RESULT" as const,
          card: drawnCard,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: "DECK" as const,
          destinationZone: "DISCARD" as const,
          actionLabel: `${drawnCard.rank} ${drawnCard.suit} (${cardExploded ? "EXPLODED" : "PASSED"})`,
          outcome: (cardExploded ? "EXPLODED" : "PASSED") as "EXPLODED" | "PASSED",
          vfxType:
            exploded && drawnCard.id === chosenCard?.id
              ? ("dynamite" as const)
              : undefined,
          vfxTargetId:
            exploded && drawnCard.id === chosenCard?.id ? player.id : undefined,
        };
      }),
    ]);

    events.push({
      type: "JUDGEMENT_RESOLVED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        judgementType: "DYNAMITE",
        judgementCard,
        drawnCard: chosenCard,
        drawnCards,
        result: exploded ? "EXPLODED" : "PASSED",
        damage: exploded ? 3 : 0,
      },
      timestamp: Date.now(),
    });

    if (exploded) {
      this.discardJudgementCard(state, judgementCard);
      events.push({
        type: "DYNAMITE_EXPLODED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: judgementCard,
          damage: 3,
        },
        timestamp: Date.now(),
      });

      AtomicEffects.applyDamage(state, undefined, player, 3, events, judgementCard, deckManager);

      if (player.isDead) {
        return { turnSkipped: true, playerDied: true, waitingForRescue: false };
      }
      if (state.pendingReactions.some((r: any) => r.type === "NEAR_DEATH_RESCUE")) {
        return { turnSkipped: false, playerDied: false, waitingForRescue: true };
      }
      return { turnSkipped: false, playerDied: false, waitingForRescue: false };
    }

    const candidates = SeatManager.getClockwisePlayers(state, player.id, false);
    const nextSeat =
      candidates.find((c) => !c.judgements.some((j) => j.type === "DYNAMITE")) ??
      SeatManager.getPlayerOnLeft(state, player.id);

    state.attachedSeqCounter += 1;
    const passedJudgement: ActiveJudgement = {
      id: judgementId,
      card: judgementCard,
      type: "DYNAMITE",
      attachedSeq: state.attachedSeqCounter,
      attachedTimestamp: Date.now(),
    };
    nextSeat.judgements.push(passedJudgement);
    if (dynArenaEntries[0]) {
      dynArenaEntries[0].destinationPlayerId = nextSeat.id;
    }

    events.push({
      type: "DYNAMITE_PASSED",
      payload: {
        fromPlayerId: player.id,
        fromPlayerName: player.name,
        toPlayerId: nextSeat.id,
        toPlayerName: nextSeat.name,
        card: judgementCard,
        newSeq: state.attachedSeqCounter,
      },
      timestamp: Date.now(),
    });

    return { turnSkipped: false, playerDied: false, waitingForRescue: false };
  }

  // Resolve Jail judgement outcome
  public static resolveJailOutcome(
    state: SimulationState,
    player: EnginePlayer,
    judgementCard: EngineCard,
    chosenCard: EngineCard | undefined,
    drawnCards: EngineCard[],
    events: DomainEvent[]
  ): JudgementPhaseResult {
    const success = Boolean(chosenCard && this.isJailEscaped(chosenCard, state));
    this.discardJudgementCard(state, judgementCard);

    ArenaChainManager.appendBatch(state, [
      {
        kind: "CHECK_SOURCE",
        card: judgementCard,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "JUDGEMENT",
        destinationZone: "DISCARD",
        actionLabel: "JAIL Judgement",
      },
      ...drawnCards.map((drawnCard) => {
        const escaped = this.isJailEscaped(drawnCard, state);
        return {
          kind: "CHECK_RESULT" as const,
          card: drawnCard,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: "DECK" as const,
          destinationZone: "DISCARD" as const,
          actionLabel: `${drawnCard.rank} ${drawnCard.suit} (${escaped ? "ESCAPED" : "LOCKED"})`,
          outcome: (escaped ? "ESCAPED" : "LOCKED") as "ESCAPED" | "LOCKED",
        };
      }),
    ]);

    events.push({
      type: "JUDGEMENT_RESOLVED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        judgementType: "JAIL",
        judgementCard,
        drawnCard: chosenCard,
        drawnCards,
        result: success ? "ESCAPED" : "LOCKED",
      },
      timestamp: Date.now(),
    });

    if (!success) {
      events.push({
        type: "JAIL_FAILED_SKIP_TURN",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card: judgementCard,
        },
        timestamp: Date.now(),
      });
      return { turnSkipped: true, playerDied: false, waitingForRescue: false };
    }

    events.push({
      type: "JAIL_ESCAPED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        card: judgementCard,
      },
      timestamp: Date.now(),
    });
    return { turnSkipped: false, playerDied: false, waitingForRescue: false };
  }

  // Execute Phase 0 judgements
  public static executePhase0(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): JudgementPhaseResult {
    if (player.isGhost || player.judgements.length === 0) {
      return { turnSkipped: false, playerDied: false, waitingForRescue: false };
    }

    // Resolve Dynamite strictly before Jail
    const orderedJudgements = [...player.judgements].sort((a, b) => {
      const pA = a.type === "DYNAMITE" ? 0 : 1;
      const pB = b.type === "DYNAMITE" ? 0 : 1;
      if (pA !== pB) return pA - pB;
      return b.attachedSeq - a.attachedSeq;
    });

    for (const judgement of orderedJudgements) {
      if (player.isDead || state.pendingReactions.length > 0 || state.activeChain.length > 0) {
        break;
      }

      if (judgement.type === "DYNAMITE") {
        player.judgements = player.judgements.filter((j) => j.id !== judgement.id);

        const check = SkillHooks.executeDrawCheck(
          state,
          player,
          "DYNAMITE",
          (card, st) => !this.isDynamiteExploded(card, st),
          { judgementCard: judgement.card, judgementId: judgement.id }
        );
        events.push(...check.events);

        if (check.pendingInteraction) {
          return { turnSkipped: false, playerDied: false, waitingForRescue: true };
        }

        const dynRes = this.resolveDynamiteOutcome(
          state,
          player,
          judgement.card,
          judgement.id,
          check.chosenCard,
          check.drawnCards,
          events
        );
        if (dynRes.playerDied || dynRes.waitingForRescue) {
          return dynRes;
        }
      } else if (judgement.type === "JAIL") {
        if (player.isDead || state.pendingReactions.length > 0 || state.activeChain.length > 0) {
          break;
        }

        player.judgements = player.judgements.filter((j) => j.id !== judgement.id);

        const check = SkillHooks.executeDrawCheck(
          state,
          player,
          "JAIL",
          (card, st) => this.isJailEscaped(card, st),
          { judgementCard: judgement.card, judgementId: judgement.id }
        );
        events.push(...check.events);

        if (check.pendingInteraction) {
          return { turnSkipped: false, playerDied: false, waitingForRescue: true };
        }

        const jailRes = this.resolveJailOutcome(
          state,
          player,
          judgement.card,
          check.chosenCard,
          check.drawnCards,
          events
        );
        if (jailRes.turnSkipped) {
          return jailRes;
        }
      }
    }

    return { turnSkipped: false, playerDied: false, waitingForRescue: false };
  }
}
