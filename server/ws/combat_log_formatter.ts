import { DomainEvent } from "../engine/types/actions";

export interface StructuredLogEntry {
  id: string;
  eventType: string;
  params: Record<string, unknown>;
  fallbackText: string;
}

export interface StoredStructuredSpec {
  id: string;
  eventType: string;
  publicParams: Record<string, unknown>;
  visibleTo?: string[];
  privateParams?: Record<string, unknown>;
}

export interface StoredLogEntry {
  publicText: string;
  visibleTo?: string[];
  privateText?: string;
  structured?: StoredStructuredSpec;
}

let logEntryCounter = 0;
function nextLogId(ev?: DomainEvent): string {
  logEntryCounter = (logEntryCounter + 1) % 1_000_000;
  return `${ev?.timestamp ?? Date.now()}_${logEntryCounter}`;
}

function cardSummary(card?: any): Record<string, unknown> | undefined {
  if (!card?.name) return undefined;
  return {
    name: card.name,
    rank: card.rank,
    suit: card.suit,
    templateId: card.templateId,
  };
}

// Render player-scoped combat log strings
export function getLogsForPlayer(
  entries: StoredLogEntry[],
  playerId: string,
  limit = 100
): string[] {
  return entries.slice(0, limit).map((entry) =>
    entry.visibleTo &&
    entry.visibleTo.includes(playerId) &&
    entry.privateText
      ? entry.privateText
      : entry.publicText
  );
}

// Render player-scoped structured log payloads
export function getStructuredLogsForPlayer(
  entries: StoredLogEntry[],
  playerId: string,
  limit = 100
): StructuredLogEntry[] {
  return entries.slice(0, limit).map((entry, idx) => {
    const canSeePrivate = Boolean(
      entry.visibleTo && entry.visibleTo.includes(playerId)
    );
    const fallbackText =
      canSeePrivate && entry.privateText ? entry.privateText : entry.publicText;

    if (!entry.structured) {
      return {
        id: `legacy_${idx}`,
        eventType: "RAW_TEXT",
        params: {},
        fallbackText,
      };
    }

    const params =
      canSeePrivate && entry.structured.privateParams
        ? { ...entry.structured.publicParams, ...entry.structured.privateParams }
        : { ...entry.structured.publicParams };

    return {
      id: entry.structured.id,
      eventType: entry.structured.eventType,
      params,
      fallbackText,
    };
  });
}

// Format domain event to player-safe log
export function formatEventToLog(
  ev: DomainEvent,
  players?: Map<string, { name: string }>
): StoredLogEntry | null {
  const p = ev.payload;
  if (!p) return null;

  const nameOf = (id?: string, fallback?: string): string =>
    (id ? players?.get(id)?.name : undefined) || fallback || id || "Player";

  const suitSymbol = (suit?: string): string => {
    if (suit === "spades") return "♠";
    if (suit === "hearts") return "♥";
    if (suit === "diamonds") return "♦";
    if (suit === "clubs") return "♣";
    return "";
  };

  const fmtCard = (card?: {
    name?: string;
    rank?: string;
    suit?: string;
  }): string => {
    if (!card?.name) return "card";
    const sym = suitSymbol(card.suit);
    return card.rank && sym ? `${card.name}[${sym}${card.rank}]` : card.name;
  };

  const logId = nextLogId(ev);

  const pub = (
    text: string,
    eventType: string = ev.type,
    publicParams: Record<string, unknown> = {}
  ): StoredLogEntry => ({
    publicText: text,
    structured: {
      id: logId,
      eventType,
      publicParams,
    },
  });

  const scoped = (
    publicText: string,
    privateText: string,
    visibleTo: string[] | undefined,
    eventType: string,
    publicParams: Record<string, unknown>,
    privateParams: Record<string, unknown>
  ): StoredLogEntry => ({
    publicText,
    visibleTo,
    privateText,
    structured: {
      id: logId,
      eventType,
      publicParams,
      visibleTo,
      privateParams,
    },
  });

  switch (ev.type) {
    case "CHARACTER_SELECT_STARTED":
      return pub(
        `---------- Character selection started (${p.playerCount} players) ----------`,
        ev.type,
        { playerCount: p.playerCount ?? 0 }
      );
    case "CHARACTERS_SELECTED": {
      const charList = Array.isArray(p.characters)
        ? p.characters.map((c: any) => c.name)
        : [];
      const charNames = charList.length > 0 ? charList.join(" & ") : "characters";
      const actor = nameOf(p.playerId, p.playerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.playerId
          ? [p.playerId]
          : undefined;
      return scoped(
        `${actor} locked in character selection.`,
        `${actor} chose [${charNames}] (${p.maxHp} Max HP).`,
        visibleTo,
        ev.type,
        { actor },
        { characterNames: charList, maxHp: p.maxHp }
      );
    }
    case "MATCH_STARTED":
      return pub(
        `---------- Match Started${p.is3PlayerVariant ? " (3P Quarry)" : ""} ----------`,
        ev.type,
        { is3PlayerVariant: Boolean(p.is3PlayerVariant) }
      );
    case "DECK_RESHUFFLED":
      return pub(
        `Deck exhausted: reshuffled discard pile (${p.newDeckCount ?? 0} draw cards ready).`,
        ev.type,
        { newDeckCount: p.newDeckCount ?? 0 }
      );
    case "EVENT_REVEALED":
      return pub(
        `Round ${p.roundNumber} event revealed: [${p.event?.name || "Event"}].`,
        ev.type,
        {
          roundNumber: p.roundNumber,
          eventName: p.event?.name || "Event",
          event: p.event ? { id: p.event.id, name: p.event.name } : undefined,
        }
      );
    case "EVENT_DEAD_MAN_REVIVED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(`[Dead Man] revived ${playerName} with ${p.hp} HP.`, ev.type, {
        playerName,
        hp: p.hp,
      });
    }
    case "EVENT_GHOST_TOWN_ENTER": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `[Ghost Town] allowed ${playerName} to act as a ghost.`,
        ev.type,
        { playerName }
      );
    }
    case "EVENT_GHOST_TOWN_EXIT": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `${playerName} returned to rest after [Ghost Town].`,
        ev.type,
        { playerName }
      );
    }
    case "EVENT_VENDETTA_EXTRA_TURN": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(`[Vendetta] granted ${playerName} an extra turn.`, ev.type, {
        playerName,
      });
    }
    case "EVENT_BLOOD_BROTHERS_RESOLVED": {
      const fromPlayerName = nameOf(p.fromPlayerId, p.fromPlayerName);
      const targetPlayerName = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `[Blood Brothers] ${fromPlayerName} gave 1 HP to ${targetPlayerName}.`,
        ev.type,
        { fromPlayerName, targetPlayerName }
      );
    }
    case "EVENT_BLOOD_BROTHERS_SKIPPED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `[Blood Brothers] ${playerName} skipped life transfer.`,
        ev.type,
        { playerName }
      );
    }
    case "EVENT_DIRECTION_CHANGED":
      return pub(`[Gold Rush] reversed turn direction.`, ev.type);
    case "EVENT_THE_DOCTOR_HEAL":
      return pub(`[The Doctor] healed lowest HP players.`, ev.type);
    case "EVENT_RANCH_EXCHANGE": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `[Ranch] ${playerName} exchanged ${p.discardedCount} card(s).`,
        ev.type,
        { playerName, discardedCount: p.discardedCount }
      );
    }
    case "EVENT_HARD_LIQUOR_HEAL": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `[Hard Liquor] ${playerName} skipped phase 1 draw to heal 1 HP.`,
        ev.type,
        { playerName }
      );
    }
    case "EVENT_PEYOTE_GUESS": {
      const actor = nameOf(p.playerId, p.playerName);
      const guessed = p.choice ?? p.guess ?? "?";
      const isCorrect = Boolean(p.matched ?? p.correct);
      return pub(
        `[Peyote] ${actor} guessed ${guessed}, checked ${fmtCard(p.card)} (${
          isCorrect ? "correct" : "wrong"
        }).`,
        ev.type,
        {
          actor,
          guess: guessed,
          matched: isCorrect,
          card: cardSummary(p.card),
        }
      );
    }
    case "EVENT_TRAIN_ARRIVAL_DRAW": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `[Train Arrival] gave ${playerName} 1 bonus card.`,
        ev.type,
        { playerName }
      );
    }
    case "EVENT_DALTONS_DISCARDED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `[The Daltons] ${actor} discarded ${fmtCard(p.card)} from play.`,
        ev.type,
        { actor, card: cardSummary(p.card) }
      );
    }
    case "VERA_CUSTER_COPIED": {
      const actor = nameOf(p.playerId, p.playerName);
      const characterName = p.copiedCharacter?.name || "hero";
      const sourceOwnerName = nameOf(p.sourceOwnerPlayerId, p.sourceOwnerName);
      return pub(
        `${actor} activated [Vera Custer]: copied [${characterName}] from ${sourceOwnerName}.`,
        ev.type,
        {
          actor,
          characterName,
          sourceOwnerName,
        }
      );
    }
    case "TURN_STARTED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `--- Round ${p.roundNumber}: ${playerName}'s turn ---`,
        ev.type,
        { roundNumber: p.roundNumber, playerName }
      );
    }
    case "TURN_ENDED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(`${playerName}'s turn ended.`, ev.type, {
        playerName,
      });
    }
    case "TURN_SKIPPED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `${playerName}'s turn skipped (${p.reason || "effect"}).`,
        ev.type,
        { playerName, reason: p.reason || "effect" }
      );
    }
    case "PHASE_CHANGED": {
      if (p.phase === 1 && (p.drawnCount ?? 0) > 0 && p.playerId) {
        const actor = nameOf(p.playerId, p.playerName);
        const count = p.drawnCount;
        const publicText = `${actor} drew ${count} card(s).`;
        if (Array.isArray(p.drawnCards) && p.drawnCards.length > 0) {
          const detail = p.drawnCards.map((c: any) => fmtCard(c)).join(", ");
          const visibleTo =
            ev.visibleTo && ev.visibleTo.length > 0
              ? ev.visibleTo
              : [p.playerId];
          return scoped(
            publicText,
            `${actor} drew ${count} card(s): ${detail}.`,
            visibleTo,
            "PHASE_CHANGED_DRAW",
            { actor, count },
            { drawnCards: p.drawnCards.map((c: any) => cardSummary(c)) }
          );
        }
        return pub(publicText, "PHASE_CHANGED_DRAW", { actor, count });
      }
      return null;
    }
    case "LUCKY_DUKE_DRAW_PENDING": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} [Lucky Duke -> ${p.reason || "Check"}]: choosing 1 of 2 drawn cards.`,
        ev.type,
        { actor, reason: p.reason || "Check" }
      );
    }
    case "DRAW_CHECK_RESULT": {
      const actor = nameOf(p.playerId, p.playerName);
      if (p.emptyDeck) {
        return pub(
          `${actor} [${p.reason || "Check"}]: empty deck -> NO CARD.`,
          ev.type,
          { actor, reason: p.reason || "Check", emptyDeck: true }
        );
      }
      const cardStr = fmtCard(p.chosenCard);
      const resStr = p.success ? "PASSED" : "FAILED";
      const isLucky = Array.isArray(p.drawnCards) && p.drawnCards.length >= 2;
      const skillTag =
        p.reason === "JOURDONNAIS"
          ? "[Jourdonnais]"
          : isLucky
          ? `[Lucky Duke -> ${p.reason}]`
          : `[${p.reason || "Check"}]`;
      return pub(`${actor} ${skillTag}: ${cardStr} -> ${resStr}.`, ev.type, {
        actor,
        skillTag,
        reason: p.reason || "Check",
        success: Boolean(p.success),
        card: cardSummary(p.chosenCard),
      });
    }
    case "JUDGEMENT_RESOLVED": {
      const actor = nameOf(p.playerId, p.playerName);
      const cardStr = p.drawnCard ? fmtCard(p.drawnCard) : "NO CARD";
      return pub(
        `${actor} [${p.judgementType}]: ${cardStr} -> ${p.result}.`,
        ev.type,
        {
          actor,
          judgementType: p.judgementType,
          result: p.result,
          card: cardSummary(p.drawnCard),
        }
      );
    }
    case "DYNAMITE_EXPLODED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `Dynamite exploded on ${actor} for ${p.damage} damage.`,
        ev.type,
        { actor, damage: p.damage }
      );
    }
    case "DYNAMITE_PASSED": {
      const from = nameOf(p.fromPlayerId, p.fromPlayerName);
      const to = nameOf(p.toPlayerId, p.toPlayerName);
      return pub(`Dynamite passed clockwise from ${from} to ${to}.`, ev.type, {
        from,
        to,
      });
    }
    case "JAIL_ESCAPED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} escaped from Jail.`, ev.type, { actor });
    }
    case "JAIL_FAILED_SKIP_TURN": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} failed Jail check and lost turn.`, ev.type, { actor });
    }
    case "BANG_ATTACK_LAUNCHED": {
      const attacker = nameOf(p.attackerId, p.attackerName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(
        `${attacker} shot ${fmtCard(p.card)} at ${target} (needs ${p.requiredMissedCount} Missed!).`,
        ev.type,
        {
          attacker,
          target,
          requiredMissedCount: p.requiredMissedCount,
          card: cardSummary(p.card),
        }
      );
    }
    case "DOC_HOLYDAY_BANG": {
      const actor = nameOf(p.playerId, p.playerName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(
        `${actor} activated [Doc Holyday] shot at ${target}.`,
        ev.type,
        { actor, target }
      );
    }
    case "RICOCHET_SHOT_LAUNCHED": {
      const attacker = nameOf(p.attackerId, p.attackerName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(`${attacker} fired [Ricochet] at ${target}.`, ev.type, {
        attacker,
        target,
      });
    }
    case "RICOCHET_SHOT_RESOLVED": {
      const target = nameOf(p.targetPlayerId ?? p.targetId, p.targetName);
      return pub(`[Ricochet] resolved against ${target}.`, ev.type, { target });
    }
    case "PUNCH_LAUNCHED": {
      const attacker = nameOf(p.attackerId, p.attackerName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(
        `${attacker} used ${fmtCard(p.card)} on ${target}.`,
        ev.type,
        { attacker, target, card: cardSummary(p.card) }
      );
    }
    case "SPRINGFIELD_LAUNCHED": {
      const attacker = nameOf(p.attackerId, p.attackerName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(
        `${attacker} shot ${fmtCard(p.card)} at ${target}.`,
        ev.type,
        { attacker, target, card: cardSummary(p.card) }
      );
    }
    case "ATTACK_EVADED": {
      const target = nameOf(p.targetId, p.targetName);
      return pub(`${target} canceled ${fmtCard(p.sourceCard)}.`, ev.type, {
        target,
        card: cardSummary(p.sourceCard),
      });
    }
    case "PLAYER_HIT":
    case "PLAYER_DAMAGED": {
      const victim = nameOf(p.victimId, p.victimName);
      return pub(
        `${victim} took ${p.damage} damage (HP: ${p.currentHp}).`,
        "PLAYER_DAMAGED",
        { victim, damage: p.damage, currentHp: p.currentHp }
      );
    }
    case "FATAL_DAMAGE_REVIVED_WITH_BEER": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} used Beer at death's door to survive.`, ev.type, {
        actor,
      });
    }
    case "NEAR_DEATH_RESCUE_PENDING":
    case "SID_KETCHUM_RESCUE_PENDING": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} is at death's door (needs +${p.neededHeal ?? 1} HP rescue).`,
        ev.type,
        { actor, neededHeal: p.neededHeal ?? 1 }
      );
    }
    case "SID_KETCHUM_RESCUED": {
      const actor = nameOf(p.playerId, p.playerName);
      const discardedCount = Array.isArray(p.discardedCards)
        ? p.discardedCards.length
        : 2;
      return pub(
        `${actor} activated [Sid Ketchum]: discarded ${discardedCount} card(s) to survive at ${
          p.currentHp ?? 1
        } HP.`,
        ev.type,
        { actor, discardedCount, currentHp: p.currentHp ?? 1 }
      );
    }
    case "PLAYER_ELIMINATED": {
      const playerName = nameOf(p.playerId, p.playerName);
      return pub(
        `${playerName} was eliminated (Role: ${p.revealedRole}).`,
        ev.type,
        { playerName, role: p.revealedRole }
      );
    }
    case "OUTLAW_BOUNTY_REWARD": {
      const killer = nameOf(p.killerId, p.killerName);
      return pub(
        `${killer} claimed Outlaw bounty (+${p.rewardCount ?? 3} card(s)).`,
        ev.type,
        { killer, rewardCount: p.rewardCount ?? 3 }
      );
    }
    case "SHERIFF_PENALTY_DISCARD": {
      const sheriff = nameOf(p.sheriffId, p.sheriffName);
      return pub(
        `${sheriff} lost ${p.cardsLostCount ?? 0} card(s) for eliminating a Deputy.`,
        ev.type,
        { sheriff, cardsLostCount: p.cardsLostCount ?? 0 }
      );
    }
    case "GAME_OVER":
      return pub(
        `---------- GAME OVER: ${p.winner} (${p.message}) ----------`,
        ev.type,
        { winner: p.winner, message: p.message }
      );
    case "HEAL_RESOLVED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} recovered ${p.healedAmount} HP (HP: ${p.currentHp}/${p.maxHp}).`,
        ev.type,
        {
          actor,
          healedAmount: p.healedAmount,
          currentHp: p.currentHp,
          maxHp: p.maxHp,
        }
      );
    }
    case "BEER_NO_EFFECT_2P":
      return pub(`Beer has no effect in a 2-player showdown.`, ev.type);
    case "SALOON_HEALED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      return pub(
        `${actor} played Saloon: all living players recovered 1 HP.`,
        ev.type,
        { actor }
      );
    }
    case "AOE_INDIANS_TRIGGERED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      return pub(
        `${actor} played ${fmtCard(p.sourceCard)}: all others must respond with BANG!.`,
        ev.type,
        { actor, card: cardSummary(p.sourceCard) }
      );
    }
    case "AOE_GATLING_TRIGGERED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      return pub(
        `${actor} fired ${
          p.sourceCard ? fmtCard(p.sourceCard) : "Gatling"
        }: all others must cancel with Missed!.`,
        ev.type,
        {
          actor,
          card: cardSummary(p.sourceCard),
          cardName: p.sourceCard ? undefined : "Gatling",
        }
      );
    }
    case "REACTION_AOE_LAUNCHED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const count = Array.isArray(p.affectedPlayerIds)
        ? p.affectedPlayerIds.length
        : 0;
      return pub(
        `${actor} played ${fmtCard(p.sourceCard)} targeting ${count} player(s).`,
        ev.type,
        { actor, card: cardSummary(p.sourceCard), affectedCount: count }
      );
    }
    case "INSTANT_AOE_RESOLVED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      return pub(
        `${actor} resolved ${fmtCard(p.sourceCard)} (${
          p.affectedCount ?? 0
        } target(s)).`,
        ev.type,
        {
          actor,
          card: cardSummary(p.sourceCard),
          affectedCount: p.affectedCount ?? 0,
        }
      );
    }
    case "DEFENSE_CARD_PLAYED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} played ${fmtCard(p.card)} to defend (${
          p.currentCount ?? 1
        }/${p.requiredCount ?? 1}).`,
        ev.type,
        {
          actor,
          card: cardSummary(p.card),
          currentCount: p.currentCount ?? 1,
          requiredCount: p.requiredCount ?? 1,
        }
      );
    }
    case "INDIANS_DEFENDED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} discarded ${fmtCard(p.card)} to fend off Indians!.`,
        ev.type,
        { actor, card: cardSummary(p.card) }
      );
    }
    case "DUEL_STARTED": {
      const initiator = nameOf(p.initiatorId, p.initiatorName);
      const target = nameOf(p.targetId, p.targetName);
      return pub(`${initiator} challenged ${target} to a Duel.`, ev.type, {
        initiator,
        target,
      });
    }
    case "DUEL_BANG_RETURNED": {
      const from = nameOf(p.fromPlayerId, p.fromPlayerName);
      const to = nameOf(p.toPlayerId, p.toPlayerName);
      return pub(
        `${from} played ${fmtCard(p.card)} in Duel against ${to}.`,
        ev.type,
        { from, to, card: cardSummary(p.card) }
      );
    }
    case "BRAWL_PICK_STARTED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const target = nameOf(p.currentTargetId, p.currentTargetName);
      return pub(
        `${actor} played Brawl: choosing a card to discard from ${target} (${
          p.remainingCount ?? 1
        } remaining).`,
        ev.type,
        { actor, target, remainingCount: p.remainingCount ?? 1 }
      );
    }
    case "BRAWL_PICK_ADVANCED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const target = nameOf(p.currentTargetId, p.currentTargetName);
      return pub(
        `${actor} [Brawl]: choosing a card to discard from ${target} (${
          p.remainingCount ?? 1
        } remaining).`,
        ev.type,
        { actor, target, remainingCount: p.remainingCount ?? 1 }
      );
    }
    case "BRAWL_RESOLVED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      return pub(`${actor} played Brawl.`, ev.type, { actor });
    }
    case "GENERAL_STORE_OPENED": {
      const actor = nameOf(p.originPlayerId, p.originPlayerName);
      return pub(
        `${actor} opened General Store (${p.pool?.length || 0} cards).`,
        ev.type,
        { actor, count: p.pool?.length || 0 }
      );
    }
    case "GENERAL_STORE_CARD_PICKED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} chose ${fmtCard(p.card)} from General Store.`,
        ev.type,
        { actor, card: cardSummary(p.card) }
      );
    }
    case "EQUIPMENT_STOLEN": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} stole ${fmtCard(p.card)} from ${victim}'s equipment.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "EQUIPMENT_DESTROYED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} discarded ${fmtCard(p.card)} from ${victim}'s equipment.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "GREEN_CARD_STOLEN": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} stole ${fmtCard(p.card)} from ${victim}'s green cards.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "GREEN_CARD_DESTROYED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} discarded ${fmtCard(p.card)} from ${victim}'s green cards.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "JUDGEMENT_STOLEN": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} stole ${fmtCard(p.card)} from ${victim}'s judgements.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "JUDGEMENT_DESTROYED": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} discarded ${fmtCard(p.card)} from ${victim}'s judgements.`,
        ev.type,
        { actor, victim, card: cardSummary(p.card) }
      );
    }
    case "CARD_STOLEN_FROM_HAND": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.sourcePlayerId && p.targetPlayerId
          ? [p.sourcePlayerId, p.targetPlayerId]
          : undefined;
      return scoped(
        `${actor} stole a card from ${victim}'s hand.`,
        `${actor} stole ${fmtCard(p.card)} from ${victim}'s hand.`,
        visibleTo,
        ev.type,
        { actor, victim },
        { card: cardSummary(p.card) }
      );
    }
    case "CARD_DESTROYED_FROM_HAND": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.sourcePlayerId && p.targetPlayerId
          ? [p.sourcePlayerId, p.targetPlayerId]
          : undefined;
      return scoped(
        `${actor} removed a card from ${victim}'s hand.`,
        `${actor} removed ${fmtCard(p.card)} from ${victim}'s hand.`,
        visibleTo,
        ev.type,
        { actor, victim },
        { card: cardSummary(p.card) }
      );
    }
    case "EQUIPMENT_EQUIPPED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} equipped ${fmtCard(p.card)}.`, ev.type, {
        actor,
        card: cardSummary(p.card),
      });
    }
    case "GREEN_CARD_EQUIPPED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} placed ${fmtCard(p.card)}.`, ev.type, {
        actor,
        card: cardSummary(p.card),
      });
    }
    case "GREEN_CARD_ACTIVATED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated ${
          p.card ? fmtCard(p.card) : p.cardName || "green card"
        }.`,
        ev.type,
        {
          actor,
          card: cardSummary(p.card),
          cardName: p.cardName || "green card",
        }
      );
    }
    case "JAIL_ATTACHED": {
      const target = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(`${target} was placed in Jail.`, ev.type, { target });
    }
    case "DYNAMITE_ATTACHED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} placed Dynamite.`, ev.type, { actor });
    }
    case "BLACK_JACK_REVEAL": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Black Jack]: revealed ${fmtCard(p.card)}${
          p.bonusDrawn ? " and drew 1 bonus card" : ""
        }.`,
        ev.type,
        {
          actor,
          card: cardSummary(p.card),
          bonusDrawn: Boolean(p.bonusDrawn),
        }
      );
    }
    case "LAW_OF_THE_WEST_REVEAL": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `[Law of the West] ${actor} must play ${fmtCard(p.card)}.`,
        ev.type,
        { actor, card: cardSummary(p.card) }
      );
    }
    case "KIT_CARLSON_PICKED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Kit Carlson]: chose ${p.pickedCount ?? 2} card(s).`,
        ev.type,
        { actor, count: p.pickedCount ?? 2 }
      );
    }
    case "PEDRO_RAMIREZ_DRAW": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Pedro Ramirez]: drew ${fmtCard(
          p.card
        )} from discard pile.`,
        ev.type,
        { actor, card: cardSummary(p.card) }
      );
    }
    case "JESSE_JONES_STEAL": {
      const actor = nameOf(p.playerId, p.playerName);
      const target = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${actor} activated [Jesse Jones]: stole first card from ${target}.`,
        ev.type,
        { actor, target }
      );
    }
    case "PAT_BRENNAN_STEAL": {
      const actor = nameOf(p.playerId, p.playerName);
      const target = nameOf(p.targetPlayerId, p.targetPlayerName);
      const stolenLabel = p.card ? fmtCard(p.card) : p.cardName || "card";
      return pub(
        `${actor} activated [Pat Brennan]: stole ${stolenLabel} from ${target}.`,
        ev.type,
        {
          actor,
          target,
          card: cardSummary(p.card),
          cardName: p.cardName || "card",
        }
      );
    }
    case "VULTURE_SAM_SCAVENGED": {
      const scavenger = nameOf(p.scavengerId, p.scavengerName ?? p.playerName);
      const count = p.cardsCount ?? p.cardCount ?? 0;
      const victimName =
        p.victimName || p.victimId ? nameOf(p.victimId, p.victimName) : "";
      const victimPart = victimName ? ` from ${victimName}` : "";
      return pub(
        `${scavenger} activated [Vulture Sam]: claimed ${count} card(s)${victimPart}.`,
        ev.type,
        { actor: scavenger, count, victim: victimName }
      );
    }
    case "GREG_DIGGER_HEALED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Greg Digger]: healed ${p.healedAmount ?? 2} HP.`,
        ev.type,
        { actor, healedAmount: p.healedAmount ?? 2 }
      );
    }
    case "HERB_HUNTER_DRAW": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Herb Hunter]: drew ${p.drawnCount ?? 2} card(s).`,
        ev.type,
        { actor, drawnCount: p.drawnCount ?? 2 }
      );
    }
    case "SUZY_LAFAYETTE_TRIGGERED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Suzy Lafayette]: drew 1 card on empty hand.`,
        ev.type,
        { actor }
      );
    }
    case "BART_CASSIDY_TRIGGERED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [Bart Cassidy]: drew ${p.drawnCount ?? 1} card(s) from damage.`,
        ev.type,
        { actor, drawnCount: p.drawnCount ?? 1 }
      );
    }
    case "EL_GRINGO_STOLEN": {
      const victim = nameOf(p.victimId, p.victimName);
      const attacker = nameOf(p.attackerId, p.attackerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.victimId && p.attackerId
          ? [p.victimId, p.attackerId]
          : undefined;
      return scoped(
        `${victim} activated [El Gringo]: stole a card from ${attacker}.`,
        `${victim} activated [El Gringo]: stole ${fmtCard(p.card)} from ${attacker}.`,
        visibleTo,
        ev.type,
        { victim, attacker },
        { card: cardSummary(p.card) }
      );
    }
    case "MOLLY_STARK_TRIGGERED": {
      const actor = nameOf(p.playerId, p.playerName);
      const drawnCount = p.drawnCount ?? 1;
      return pub(
        `${actor} activated [Molly Stark]: drew ${drawnCount} card(s) on out-of-turn play.`,
        ev.type,
        { actor, drawnCount }
      );
    }
    case "CARDS_DRAWN": {
      const actor = nameOf(p.playerId, p.playerName);
      const count = p.count ?? p.drawnCount ?? 1;
      const sourcePart = p.sourceCard ? ` from ${fmtCard(p.sourceCard)}` : "";
      const publicText = `${actor} drew ${count} card(s)${sourcePart}.`;
      if (Array.isArray(p.cards) && p.cards.length > 0 && p.playerId) {
        const detail = p.cards.map((c: any) => fmtCard(c)).join(", ");
        const visibleTo =
          ev.visibleTo && ev.visibleTo.length > 0 ? ev.visibleTo : [p.playerId];
        return scoped(
          publicText,
          `${actor} drew ${count} card(s)${sourcePart}: ${detail}.`,
          visibleTo,
          ev.type,
          { actor, count, sourceCard: cardSummary(p.sourceCard) },
          { drawnCards: p.cards.map((c: any) => cardSummary(c)) }
        );
      }
      return pub(publicText, ev.type, {
        actor,
        count,
        sourceCard: cardSummary(p.sourceCard),
      });
    }
    case "APACHE_KID_IMMUNITY": {
      const target = nameOf(p.targetPlayerId, p.targetPlayerName);
      return pub(
        `${target} activated [Apache Kid]: resisted Diamond card.`,
        ev.type,
        { target }
      );
    }
    case "RUSSIAN_ROULETTE_SURVIVED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} survived Russian Roulette.`, ev.type, { actor });
    }
    case "RUSSIAN_ROULETTE_HIT": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`Russian Roulette hit ${actor} for 2 damage.`, ev.type, {
        actor,
      });
    }
    case "ACTIVE_SKILL_USED": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(
        `${actor} activated [${p.skill}]${p.detail ? `: ${p.detail}` : ""}.`,
        ev.type,
        { actor, skill: p.skill, detail: p.detail ?? "" }
      );
    }
    case "CARD_DISCARDED_PHASE_3": {
      const actor = nameOf(p.playerId, p.playerName);
      return pub(`${actor} discarded ${fmtCard(p.card)}.`, ev.type, {
        actor,
        card: cardSummary(p.card),
      });
    }
    default:
      return null;
  }
}
