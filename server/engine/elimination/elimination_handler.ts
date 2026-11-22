import { SimulationState, EnginePlayer } from "../types/state";
import { EngineCard } from "../types/cards";
import { DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { SeatManager } from "../board/seat_manager";
import { SkillHooks } from "../interact/skill_hooks";
import { WinConditionEvaluator } from "./win_condition";
import { getAllEquippedCards } from "../utils/inventory";

export class EliminationHandler {

  // Discard cards via manager or state
  private static discardCards(
    state: SimulationState,
    cards: EngineCard[],
    deckManager?: DeckManager
  ): void {
    if (cards.length === 0) return;
    DeckManager.discardCardsRespectingMine(state, cards, deckManager);
  }

  // Draw cards via manager or state
  private static drawCards(
    state: SimulationState,
    count: number,
    deckManager?: DeckManager
  ): { cards: EngineCard[]; events: DomainEvent[] } {
    if (deckManager) {
      return deckManager.draw(count);
    }
    return DeckManager.drawCards(state, count);
  }

  // Resolve player elimination and side effects
  public static handleElimination(
    state: SimulationState,
    deadPlayer: EnginePlayer,
    killerPlayer: EnginePlayer | undefined,
    deckManager?: DeckManager
  ): { events: DomainEvent[]; gameOver: boolean } {
    const wasGhost = Boolean(deadPlayer.isGhost);
    deadPlayer.isDead = true;
    deadPlayer.isGhost = false;
    deadPlayer.hp = 0;

    const events: DomainEvent[] = [];

    // Collect all cards from player
    const cardsToTransfer: EngineCard[] = [
      ...deadPlayer.handCards,
      ...getAllEquippedCards(deadPlayer),
      ...deadPlayer.greenCards.map((g) => g.card),
      ...deadPlayer.judgements.map((j) => j.card),
    ];

    deadPlayer.handCards = [];
    deadPlayer.equipments = { extras: [] };
    deadPlayer.greenCards = [];
    deadPlayer.judgements = [];

    // Skip triggers when ghost leaves play
    if (wasGhost) {
      this.discardCards(state, cardsToTransfer, deckManager);
      events.push({
        type: "GHOST_LEFT_PLAY",
        payload: {
          playerId: deadPlayer.id,
          playerName: deadPlayer.name,
          discardedCount: cardsToTransfer.length,
        },
        timestamp: Date.now(),
      });
      return { events, gameOver: false };
    }

    if (!state.firstEliminatedPlayerId) {
      state.firstEliminatedPlayerId = deadPlayer.id;
    }

    events.push({
      type: "PLAYER_ELIMINATED",
      payload: {
        playerId: deadPlayer.id,
        playerName: deadPlayer.name,
        revealedRole: deadPlayer.role,
        killerId: killerPlayer?.id,
        killerName: killerPlayer?.name,
      },
      timestamp: Date.now(),
    });

    // Vulture Sam scavenges victim cards
    const aliveOrder = SeatManager.getClockwisePlayers(state, deadPlayer.id, false);
    const vultureSam = aliveOrder.find(
      (p) =>
        !p.isDead &&
        !p.isGhost &&
        p.id !== deadPlayer.id &&
        SkillHooks.hasSkill(p, "Vulture Sam", state)
    );

    if (vultureSam) {
      vultureSam.handCards.push(...cardsToTransfer);
      events.push({
        type: "VULTURE_SAM_SCAVENGED",
        payload: {
          scavengerId: vultureSam.id,
          scavengerName: vultureSam.name,
          victimId: deadPlayer.id,
          victimName: deadPlayer.name,
          cardCount: cardsToTransfer.length,
          cardsCount: cardsToTransfer.length,
        },
        timestamp: Date.now(),
      });
    } else {
      this.discardCards(state, cardsToTransfer, deckManager);
    }

    // Outlaw bounty for killer
    if (killerPlayer && !killerPlayer.isDead && deadPlayer.role === "outlaw") {
      const { cards: rewardCards, events: rewardEvents } = this.drawCards(state, 3, deckManager);
      killerPlayer.handCards.push(...rewardCards);
      events.push(...rewardEvents);

      events.push({
        type: "OUTLAW_BOUNTY_REWARD",
        payload: {
          killerId: killerPlayer.id,
          killerName: killerPlayer.name,
          rewardCount: rewardCards.length,
        },
        timestamp: Date.now(),
      });
    }

    // Greg Digger and Herb Hunter reactions
    for (const player of aliveOrder) {
      if (player.isDead || player.id === deadPlayer.id) continue;

      if (!player.isGhost && SkillHooks.hasSkill(player, "Greg Digger", state)) {
        const heal = Math.min(2, player.maxHp - player.hp);
        if (heal > 0) {
          player.hp += heal;
          events.push({
            type: "GREG_DIGGER_HEALED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              healedAmount: heal,
              currentHp: player.hp,
            },
            timestamp: Date.now(),
          });
        }
      }

      if (!player.isGhost && SkillHooks.hasSkill(player, "Herb Hunter", state)) {
        const { cards, events: drawEvents } = this.drawCards(state, 2, deckManager);
        player.handCards.push(...cards);
        events.push(...drawEvents);
        if (cards.length > 0) {
          events.push({
            type: "HERB_HUNTER_DRAW",
            payload: {
              playerId: player.id,
              playerName: player.name,
              drawnCount: cards.length,
            },
            timestamp: Date.now(),
          });
        }
      }
    }

    // Sheriff penalty after elimination draws
    if (killerPlayer && !killerPlayer.isDead && killerPlayer.isSheriff && deadPlayer.role === "deputy") {
      const sheriffLoss: EngineCard[] = [
        ...killerPlayer.handCards,
        ...getAllEquippedCards(killerPlayer),
        ...killerPlayer.greenCards.map((g) => g.card),
      ];

      killerPlayer.handCards = [];
      killerPlayer.equipments = { extras: [] };
      killerPlayer.greenCards = [];
      killerPlayer.forcedPlayCardId = null;
      this.discardCards(state, sheriffLoss, deckManager);

      events.push({
        type: "SHERIFF_PENALTY_DISCARD",
        payload: {
          sheriffId: killerPlayer.id,
          sheriffName: killerPlayer.name,
          cardsLostCount: sheriffLoss.length,
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, killerPlayer, events);
    }

    // Evaluate win condition
    const winCheck = WinConditionEvaluator.evaluate(state, {
      killerId: killerPlayer?.id,
      victimRole: deadPlayer.role,
    });
    if (winCheck.gameOver) {
      state.gameOver = {
        winner: winCheck.winner,
        message: winCheck.message || "",
        outcomeCode: winCheck.outcomeCode,
        outcomeParams: winCheck.outcomeParams,
      };
      events.push({
        type: "GAME_OVER",
        payload: {
          winner: winCheck.winner,
          message: winCheck.message,
          outcomeCode: winCheck.outcomeCode,
          outcomeParams: winCheck.outcomeParams,
        },
        timestamp: Date.now(),
      });
      return { events, gameOver: true };
    }

    return { events, gameOver: false };
  }
}
