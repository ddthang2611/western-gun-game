import { SimulationState, EnginePlayer } from "../types/state";
import { ActiveJudgement, EngineCard } from "../types/cards";
import { DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { SeatManager } from "../board/seat_manager";
import { SkillHooks } from "../interact/skill_hooks";
import { AtomicEffects } from "../interact/primitives/atomic_effects";

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
      if (player.isDead || state.pendingReactions.length > 0) {
        break;
      }

      if (judgement.type === "DYNAMITE") {
        player.judgements = player.judgements.filter((j) => j.id !== judgement.id);

        const check = SkillHooks.executeDrawCheck(
          state,
          player,
          "DYNAMITE",
          (card, st) => !this.isDynamiteExploded(card, st)
        );
        events.push(...check.events);
        const exploded = check.drawnCards.length > 0 && !check.success;

        events.push({
          type: "JUDGEMENT_RESOLVED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            judgementType: "DYNAMITE",
            judgementCard: judgement.card,
            drawnCard: check.chosenCard,
            result: exploded ? "EXPLODED" : "PASSED",
            damage: exploded ? 3 : 0,
          },
          timestamp: Date.now(),
        });

        if (exploded) {
          this.discardJudgementCard(state, judgement.card);
          events.push({
            type: "DYNAMITE_EXPLODED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              card: judgement.card,
              damage: 3,
            },
            timestamp: Date.now(),
          });

          AtomicEffects.applyDamage(state, undefined, player, 3, events);

          if (player.isDead) {
            return { turnSkipped: true, playerDied: true, waitingForRescue: false };
          }
          if (state.pendingReactions.some((r: any) => r.type === "NEAR_DEATH_RESCUE")) {
            return { turnSkipped: false, playerDied: false, waitingForRescue: true };
          }
        } else {
          const candidates = SeatManager.getClockwisePlayers(state, player.id, false);
          const nextSeat =
            candidates.find((c) => !c.judgements.some((j) => j.type === "DYNAMITE")) ??
            SeatManager.getPlayerOnLeft(state, player.id);

          state.attachedSeqCounter += 1;
          const passedJudgement: ActiveJudgement = {
            id: judgement.id,
            card: judgement.card,
            type: "DYNAMITE",
            attachedSeq: state.attachedSeqCounter,
            attachedTimestamp: Date.now(),
          };
          nextSeat.judgements.push(passedJudgement);

          events.push({
            type: "DYNAMITE_PASSED",
            payload: {
              fromPlayerId: player.id,
              fromPlayerName: player.name,
              toPlayerId: nextSeat.id,
              toPlayerName: nextSeat.name,
              card: judgement.card,
              newSeq: state.attachedSeqCounter,
            },
            timestamp: Date.now(),
          });
        }
      } else if (judgement.type === "JAIL") {
        if (player.isDead || state.pendingReactions.length > 0) {
          break;
        }

        player.judgements = player.judgements.filter((j) => j.id !== judgement.id);

        const check = SkillHooks.executeDrawCheck(
          state,
          player,
          "JAIL",
          (card, st) => this.isJailEscaped(card, st)
        );
        this.discardJudgementCard(state, judgement.card);
        events.push(...check.events);

        events.push({
          type: "JUDGEMENT_RESOLVED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            judgementType: "JAIL",
            judgementCard: judgement.card,
            drawnCard: check.chosenCard,
            result: check.success ? "ESCAPED" : "LOCKED",
          },
          timestamp: Date.now(),
        });

        if (!check.success) {
          events.push({
            type: "JAIL_FAILED_SKIP_TURN",
            payload: {
              playerId: player.id,
              playerName: player.name,
              card: judgement.card,
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
            card: judgement.card,
          },
          timestamp: Date.now(),
        });
      }
    }

    return { turnSkipped: false, playerDied: false, waitingForRescue: false };
  }
}
