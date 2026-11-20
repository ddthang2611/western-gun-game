import { DomainEvent } from "../engine/types/actions";

export interface StoredLogEntry {
  publicText: string;
  visibleTo?: string[];
  privateText?: string;
}

// Render player-scoped combat log lines
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

  const pub = (text: string): StoredLogEntry => ({ publicText: text });

  switch (ev.type) {
    case "CHARACTER_SELECT_STARTED":
      return pub(
        `---------- Character selection started (${p.playerCount} players) ----------`
      );
    case "CHARACTERS_SELECTED": {
      const charNames = Array.isArray(p.characters)
        ? p.characters.map((c: any) => c.name).join(" & ")
        : "characters";
      const actor = nameOf(p.playerId, p.playerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.playerId
          ? [p.playerId]
          : undefined;
      return {
        publicText: `${actor} locked in character selection.`,
        visibleTo,
        privateText: `${actor} chose [${charNames}] (${p.maxHp} Max HP).`,
      };
    }
    case "MATCH_STARTED":
      return pub(
        `---------- Match Started${p.is3PlayerVariant ? " (3P Quarry)" : ""} ----------`
      );
    case "DECK_RESHUFFLED":
      return pub(
        `Deck exhausted: reshuffled discard pile (${p.newDeckCount ?? 0} draw cards ready).`
      );
    case "EVENT_REVEALED":
      return pub(
        `Round ${p.roundNumber} event revealed: [${p.event?.name || "Event"}].`
      );
    case "EVENT_DEAD_MAN_REVIVED":
      return pub(`[Dead Man] revived ${p.playerName} with ${p.hp} HP.`);
    case "EVENT_GHOST_TOWN_ENTER":
      return pub(`[Ghost Town] allowed ${p.playerName} to act as a ghost.`);
    case "EVENT_GHOST_TOWN_EXIT":
      return pub(`${p.playerName} returned to rest after [Ghost Town].`);
    case "EVENT_VENDETTA_EXTRA_TURN":
      return pub(`[Vendetta] granted ${p.playerName} an extra turn.`);
    case "EVENT_BLOOD_BROTHERS_RESOLVED":
      return pub(
        `[Blood Brothers] ${p.fromPlayerName} gave 1 HP to ${p.targetPlayerName}.`
      );
    case "EVENT_BLOOD_BROTHERS_SKIPPED":
      return pub(`[Blood Brothers] ${p.playerName} skipped life transfer.`);
    case "EVENT_DIRECTION_CHANGED":
      return pub(`[Gold Rush] reversed turn direction.`);
    case "EVENT_THE_DOCTOR_HEAL":
      return pub(`[The Doctor] healed lowest HP players.`);
    case "EVENT_RANCH_EXCHANGE":
      return pub(`[Ranch] ${p.playerName} exchanged ${p.discardedCount} card(s).`);
    case "EVENT_HARD_LIQUOR_HEAL":
      return pub(
        `[Hard Liquor] ${p.playerName} skipped Phase 1 draw to heal 1 HP.`
      );
    case "EVENT_PEYOTE_GUESS": {
      const guessed = p.choice ?? p.guess ?? "?";
      const isCorrect = Boolean(p.matched ?? p.correct);
      return pub(
        `[Peyote] ${nameOf(p.playerId, p.playerName)} guessed ${guessed}, flipped ${fmtCard(
          p.card
        )} (${isCorrect ? "correct" : "wrong"}).`
      );
    }
    case "EVENT_TRAIN_ARRIVAL_DRAW":
      return pub(`[Train Arrival] gave ${p.playerName} 1 bonus card.`);
    case "VERA_CUSTER_COPIED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Vera Custer]: copied [${
          p.copiedCharacter?.name || "hero"
        }] from ${p.sourceOwnerName}.`
      );
    case "TURN_STARTED":
      return pub(`--- Round ${p.roundNumber}: ${p.playerName}'s turn ---`);
    case "TURN_ENDED":
      return pub(`${p.playerName}'s turn ended.`);
    case "TURN_SKIPPED":
      return pub(`${p.playerName}'s turn skipped (${p.reason || "effect"}).`);
    case "PHASE_CHANGED": {
      if (p.phase === 1 && (p.drawnCount ?? 0) > 0 && p.playerId) {
        const actor = nameOf(p.playerId, p.playerName);
        const count = p.drawnCount;
        const publicText = `${actor} drew ${count} card(s).`;
        if (Array.isArray(p.drawnCards) && p.drawnCards.length > 0) {
          const detail = p.drawnCards.map((c: any) => fmtCard(c)).join(", ");
          return {
            publicText,
            visibleTo:
              ev.visibleTo && ev.visibleTo.length > 0
                ? ev.visibleTo
                : [p.playerId],
            privateText: `${actor} drew ${count} card(s): ${detail}.`,
          };
        }
        return pub(publicText);
      }
      return null;
    }
    case "DRAW_CHECK_RESULT": {
      if (p.emptyDeck) {
        return pub(
          `${nameOf(p.playerId, p.playerName)} [${
            p.reason || "Check"
          }]: empty deck -> NO CARD.`
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
      return pub(
        `${nameOf(p.playerId, p.playerName)} ${skillTag}: ${cardStr} -> ${resStr}.`
      );
    }
    case "JUDGEMENT_RESOLVED": {
      const cardStr = p.drawnCard ? fmtCard(p.drawnCard) : "NO CARD";
      return pub(
        `${nameOf(p.playerId, p.playerName)} [${p.judgementType}]: ${cardStr} -> ${p.result}.`
      );
    }
    case "DYNAMITE_EXPLODED":
      return pub(
        `Dynamite exploded on ${nameOf(p.playerId, p.playerName)} for ${p.damage} damage.`
      );
    case "DYNAMITE_PASSED":
      return pub(
        `Dynamite passed from ${nameOf(p.fromPlayerId, p.fromPlayerName)} to ${nameOf(
          p.toPlayerId,
          p.toPlayerName
        )}.`
      );
    case "JAIL_ESCAPED":
      return pub(`${nameOf(p.playerId, p.playerName)} escaped from Jail.`);
    case "JAIL_FAILED_SKIP_TURN":
      return pub(
        `${nameOf(p.playerId, p.playerName)} failed Jail check and lost turn.`
      );
    case "BANG_ATTACK_LAUNCHED":
      return pub(
        `${nameOf(p.attackerId, p.attackerName)} used ${fmtCard(p.card)} on ${nameOf(
          p.targetId,
          p.targetName
        )} (needs ${p.requiredMissedCount} Missed!).`
      );
    case "DOC_HOLYDAY_BANG":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Doc Holyday] shot at ${nameOf(
          p.targetId,
          p.targetName
        )}.`
      );
    case "RICOCHET_SHOT_LAUNCHED":
      return pub(
        `${nameOf(p.attackerId, p.attackerName)} fired [Ricochet] at ${nameOf(
          p.targetId,
          p.targetName
        )}.`
      );
    case "RICOCHET_SHOT_RESOLVED":
      return pub(
        `[Ricochet] resolved against ${nameOf(
          p.targetPlayerId ?? p.targetId,
          p.targetName
        )}.`
      );
    case "PUNCH_LAUNCHED":
      return pub(
        `${nameOf(p.attackerId, p.attackerName)} used ${fmtCard(p.card)} on ${nameOf(
          p.targetId,
          p.targetName
        )}.`
      );
    case "SPRINGFIELD_LAUNCHED":
      return pub(
        `${nameOf(p.attackerId, p.attackerName)} used ${fmtCard(p.card)} on ${nameOf(
          p.targetId,
          p.targetName
        )}.`
      );
    case "ATTACK_EVADED":
      return pub(
        `${nameOf(p.targetId, p.targetName)} evaded ${fmtCard(p.sourceCard)}.`
      );
    case "PLAYER_HIT":
    case "PLAYER_DAMAGED":
      return pub(
        `${nameOf(p.victimId, p.victimName)} took ${p.damage} damage (HP: ${p.currentHp}).`
      );
    case "FATAL_DAMAGE_REVIVED_WITH_BEER":
      return pub(
        `${nameOf(p.playerId, p.playerName)} used Beer[♥] at death's door to survive.`
      );
    case "PLAYER_ELIMINATED":
      return pub(`${p.playerName} was eliminated (Role: ${p.revealedRole}).`);
    case "OUTLAW_BOUNTY_REWARD":
      return pub(
        `${nameOf(p.killerId, p.killerName)} claimed Outlaw bounty (+${p.rewardCount ?? 3} card(s)).`
      );
    case "SHERIFF_PENALTY_DISCARD":
      return pub(
        `${nameOf(p.sheriffId, p.sheriffName)} lost ${p.cardsLostCount ?? 0} card(s) for eliminating a Deputy.`
      );
    case "GAME_OVER":
      return pub(`---------- GAME OVER: ${p.winner} (${p.message}) ----------`);
    case "HEAL_RESOLVED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} recovered ${p.healedAmount} HP (HP: ${p.currentHp}/${p.maxHp}).`
      );
    case "BEER_NO_EFFECT_2P":
      return pub(`Beer has no effect in a 2-player showdown.`);
    case "SALOON_HEALED":
      return pub(
        `${nameOf(p.sourcePlayerId, p.sourcePlayerName)} used Saloon: all living players recovered 1 HP.`
      );
    case "AOE_INDIANS_TRIGGERED":
      return pub(
        `${nameOf(p.sourcePlayerId, p.sourcePlayerName)} used ${fmtCard(
          p.sourceCard
        )}: all others must discard BANG!.`
      );
    case "AOE_GATLING_TRIGGERED":
      return pub(
        `${nameOf(p.sourcePlayerId, p.sourcePlayerName)} fired ${
          p.sourceCard ? fmtCard(p.sourceCard) : "Gatling"
        }: all others must play Missed!.`
      );
    case "BRAWL_RESOLVED":
      return pub(`${nameOf(p.sourcePlayerId, p.sourcePlayerName)} used Brawl.`);
    case "GENERAL_STORE_OPENED":
      return pub(
        `${p.originPlayerName} opened General Store (${p.pool?.length || 0} cards).`
      );
    case "GENERAL_STORE_CARD_PICKED":
      return pub(
        `${p.playerName} drafted ${fmtCard(p.card)} from General Store.`
      );
    case "CARD_STOLEN_FROM_HAND": {
      const actor = nameOf(p.sourcePlayerId, p.sourcePlayerName);
      const victim = nameOf(p.targetPlayerId, p.targetPlayerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.sourcePlayerId && p.targetPlayerId
          ? [p.sourcePlayerId, p.targetPlayerId]
          : undefined;
      return {
        publicText: `${actor} stole a card from ${victim}'s hand.`,
        visibleTo,
        privateText: `${actor} stole ${fmtCard(p.card)} from ${victim}'s hand.`,
      };
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
      return {
        publicText: `${actor} discarded a card from ${victim}'s hand.`,
        visibleTo,
        privateText: `${actor} destroyed ${fmtCard(p.card)} from ${victim}'s hand.`,
      };
    }
    case "EQUIPMENT_EQUIPPED":
      return pub(`${p.playerName} equipped ${fmtCard(p.card)}.`);
    case "GREEN_CARD_EQUIPPED":
      return pub(`${nameOf(p.playerId, p.playerName)} placed ${fmtCard(p.card)}.`);
    case "GREEN_CARD_ACTIVATED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated ${
          p.card ? fmtCard(p.card) : p.cardName || "green card"
        }.`
      );
    case "JAIL_ATTACHED":
      return pub(
        `${nameOf(p.targetPlayerId, p.targetPlayerName)} was placed in Jail.`
      );
    case "DYNAMITE_ATTACHED":
      return pub(`${nameOf(p.playerId, p.playerName)} placed Dynamite.`);
    case "BLACK_JACK_REVEAL":
      return pub(
        `${p.playerName} activated [Black Jack]: revealed ${fmtCard(p.card)}${
          p.bonusDrawn ? " and drew 1 bonus card" : ""
        }.`
      );
    case "LAW_OF_THE_WEST_REVEAL":
      return pub(`[Law of the West] ${p.playerName} must play ${fmtCard(p.card)}.`);
    case "KIT_CARLSON_PICKED":
      return pub(
        `${p.playerName} activated [Kit Carlson]: drafted ${p.pickedCount ?? 2} card(s).`
      );
    case "PEDRO_RAMIREZ_DRAW":
      return pub(
        `${p.playerName} activated [Pedro Ramirez]: drew ${fmtCard(
          p.card
        )} from discard.`
      );
    case "JESSE_JONES_STEAL":
      return pub(
        `${p.playerName} activated [Jesse Jones]: stole first card from ${p.targetPlayerName}.`
      );
    case "PAT_BRENNAN_STEAL": {
      const stolenLabel = p.card ? fmtCard(p.card) : p.cardName || "card";
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Pat Brennan]: stole ${stolenLabel} from ${nameOf(
          p.targetPlayerId,
          p.targetPlayerName
        )}.`
      );
    }
    case "VULTURE_SAM_SCAVENGED": {
      const scavenger = nameOf(p.scavengerId, p.scavengerName ?? p.playerName);
      const count = p.cardsCount ?? p.cardCount ?? 0;
      const victimPart =
        p.victimName || p.victimId
          ? ` from ${nameOf(p.victimId, p.victimName)}`
          : "";
      return pub(
        `${scavenger} activated [Vulture Sam]: claimed ${count} card(s)${victimPart}.`
      );
    }
    case "GREG_DIGGER_HEALED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Greg Digger]: healed ${
          p.healedAmount ?? 2
        } HP.`
      );
    case "HERB_HUNTER_DRAW":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Herb Hunter]: drew ${
          p.drawnCount ?? 2
        } card(s).`
      );
    case "SUZY_LAFAYETTE_TRIGGERED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Suzy Lafayette]: drew 1 card on empty hand.`
      );
    case "BART_CASSIDY_TRIGGERED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Bart Cassidy]: drew ${
          p.drawnCount ?? 1
        } card(s) from damage.`
      );
    case "EL_GRINGO_STOLEN": {
      const victim = nameOf(p.victimId, p.victimName);
      const attacker = nameOf(p.attackerId, p.attackerName);
      const visibleTo =
        ev.visibleTo && ev.visibleTo.length > 0
          ? ev.visibleTo
          : p.victimId && p.attackerId
          ? [p.victimId, p.attackerId]
          : undefined;
      return {
        publicText: `${victim} activated [El Gringo]: stole a card from ${attacker}.`,
        visibleTo,
        privateText: `${victim} activated [El Gringo]: stole ${fmtCard(
          p.card
        )} from ${attacker}.`,
      };
    }
    case "MOLLY_STARK_TRIGGERED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [Molly Stark]: drew 1 card on out-of-turn play.`
      );
    case "APACHE_KID_IMMUNITY":
      return pub(
        `${nameOf(p.targetPlayerId, p.targetPlayerName)} activated [Apache Kid]: resisted Diamond card.`
      );
    case "RUSSIAN_ROULETTE_SURVIVED":
      return pub(`${nameOf(p.playerId, p.playerName)} survived Russian Roulette.`);
    case "RUSSIAN_ROULETTE_HIT":
      return pub(
        `Russian Roulette hit ${nameOf(p.playerId, p.playerName)} for 2 damage.`
      );
    case "ACTIVE_SKILL_USED":
      return pub(
        `${nameOf(p.playerId, p.playerName)} activated [${p.skill}]${
          p.detail ? `: ${p.detail}` : ""
        }.`
      );
    case "CARD_DISCARDED_PHASE_3":
      return pub(
        `${nameOf(p.playerId, p.playerName)} discarded ${fmtCard(p.card)}.`
      );
    default:
      return null;
  }
}
