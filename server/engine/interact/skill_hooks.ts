import { EnginePlayer, SimulationState } from "../types/state";
import { EngineCard, Suit } from "../types/cards";
import { CommandResult, DomainEvent, PlayerCommand } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { EventRuleRegistry } from "../events/event_rule_registry";
import { SkillRegistry } from "../cards/skill_registry";
import type {
  ElGringoPickState,
  LuckyDukePickState,
  LuckyDukeReason,
  PendingReaction,
} from "./interact_types";

const DYNAMITE_RANKS = new Set(["2", "3", "4", "5", "6", "7", "8", "9"]);

export class SkillHooks {
  // Check character skill and suppression
  public static hasSkill(
    player: EnginePlayer,
    charName: string,
    state?: SimulationState
  ): boolean {
    if (EventRuleRegistry.suppressesSkills(state)) {
      return false;
    }

    const needle = charName.toLowerCase();
    const hasBase = player.characters.some(
      (c) => c.name.toLowerCase() === needle || c.id.toLowerCase() === needle
    );
    if (hasBase) return true;

    if (player.copiedCharacter) {
      return (
        player.copiedCharacter.name.toLowerCase() === needle ||
        player.copiedCharacter.id.toLowerCase() === needle
      );
    }

    return false;
  }

  // Resolve suit under active event
  public static getEffectiveSuit(card: EngineCard, state?: SimulationState): Suit {
    return EventRuleRegistry.getEffectiveSuit(state, card);
  }

  // Check if equipment is active
  public static isEquipmentEffective(
    owner: EnginePlayer,
    turnPlayer?: EnginePlayer | null,
    state?: SimulationState
  ): boolean {
    if (EventRuleRegistry.negatesEquipment(state)) {
      return false;
    }

    const activeTurn =
      turnPlayer ?? (state ? state.players.get(state.turnPlayerId) : undefined);
    if (
      activeTurn &&
      owner.id !== activeTurn.id &&
      SkillRegistry.getActiveDefinitions(activeTurn, state).some(
        (d) => d.passive?.negateOthersInPlayDuringOwnTurn
      )
    ) {
      return false;
    }

    return true;
  }

  // Slab the Killer attack modifier
  public static getMissedRequiredForAttack(
    attacker: EnginePlayer,
    card: EngineCard,
    state?: SimulationState
  ): number {
    if (card.name === "BANG!") {
      for (const def of SkillRegistry.getActiveDefinitions(attacker, state)) {
        if (def.passive?.standardBangMissedRequired) {
          return def.passive.standardBangMissedRequired;
        }
      }
    }
    return 1;
  }

  // Apache Kid Diamonds immunity check
  public static isImmuneToCard(
    defender: EnginePlayer,
    card: EngineCard,
    attacker?: EnginePlayer | null,
    state?: SimulationState
  ): boolean {
    if (!attacker || attacker.id === defender.id) {
      return false;
    }
    const suit = SkillHooks.getEffectiveSuit(card, state);
    return SkillRegistry.getActiveDefinitions(defender, state).some(
      (d) => d.passive?.immuneToOtherPlayersSuit === suit
    );
  }

  // Calamity Janet and Elena Fuente
  public static canSubstituteCard(
    player: EnginePlayer,
    card: EngineCard,
    targetRole: "BANG" | "MISSED",
    state?: SimulationState
  ): boolean {
    for (const def of SkillRegistry.getActiveDefinitions(player, state)) {
      if (targetRole === "MISSED" && def.substitution?.allowAnyHandAsMissed) {
        return true;
      }
      if (targetRole === "MISSED" && card.name === "BANG!" && def.substitution?.allowBangAsMissed) {
        return true;
      }
      if (targetRole === "BANG" && card.name === "MISSED!" && def.substitution?.allowMissedAsBang) {
        return true;
      }
    }

    return false;
  }

  // Jourdonnais innate Barrel check
  public static hasInnateBarrel(player: EnginePlayer, state?: SimulationState): boolean {
    return SkillRegistry.getActiveDefinitions(player, state).some(
      (d) => d.passive?.innateBarrel
    );
  }

  // Willy the Kid unlimited BANG!
  public static hasUnlimitedBang(player: EnginePlayer, state?: SimulationState): boolean {
    return SkillRegistry.getActiveDefinitions(player, state).some(
      (d) => d.passive?.unlimitedBang
    );
  }

  // Paul Regret defense distance bonus
  public static getDistanceDefenseBonus(
    defender: EnginePlayer,
    state?: SimulationState
  ): number {
    let bonus = 0;
    for (const def of SkillRegistry.getActiveDefinitions(defender, state)) {
      bonus += def.passive?.defenseDistanceBonus ?? 0;
    }
    return bonus;
  }

  // Rose Doolan offense distance bonus
  public static getDistanceOffenseBonus(
    attacker: EnginePlayer,
    state?: SimulationState
  ): number {
    let bonus = 0;
    for (const def of SkillRegistry.getActiveDefinitions(attacker, state)) {
      bonus += def.passive?.offenseDistanceBonus ?? 0;
    }
    return bonus;
  }

  // Sean Mallory end-turn hand limit
  public static getPhase3HandLimit(
    player: EnginePlayer,
    state?: SimulationState
  ): number {
    for (const def of SkillRegistry.getActiveDefinitions(player, state)) {
      if (def.passive?.phase3HandLimit !== undefined) {
        return def.passive.phase3HandLimit;
      }
    }
    return player.hp;
  }

  // Tequila Joe Beer heal amount
  public static getBeerHealAmount(
    player: EnginePlayer,
    state?: SimulationState
  ): number {
    for (const def of SkillRegistry.getActiveDefinitions(player, state)) {
      if (def.passive?.beerHealAmount !== undefined) {
        return def.passive.beerHealAmount;
      }
    }
    return 1;
  }

  // Evaluate Draw! condition by reason
  public static isDrawCheckSuccess(
    reason: LuckyDukeReason,
    card: EngineCard,
    state?: SimulationState
  ): boolean {
    const suit = SkillHooks.getEffectiveSuit(card, state);
    if (reason === "DYNAMITE") {
      return !(suit === "spades" && DYNAMITE_RANKS.has(card.rank));
    }
    return suit === "hearts";
  }

  // Emit finalized Draw! check result
  public static emitDrawCheckResult(
    state: SimulationState,
    player: EnginePlayer,
    reason: string,
    isLuckyDuke: boolean,
    drawn: EngineCard[],
    chosenCard: EngineCard | undefined,
    success: boolean,
    events: DomainEvent[]
  ): void {
    const effectiveSuit = chosenCard
      ? SkillHooks.getEffectiveSuit(chosenCard, state)
      : undefined;

    events.push({
      type: "DRAW_CHECK_RESULT",
      payload: {
        playerId: player.id,
        playerName: player.name,
        reason,
        isLuckyDuke,
        drawnCards: drawn,
        chosenCard,
        effectiveSuit,
        effectiveSuits: drawn.map((c) => SkillHooks.getEffectiveSuit(c, state)),
        emptyDeck: drawn.length === 0,
        success,
        isSuccess: success,
      },
      timestamp: Date.now(),
    });
  }

  // Lucky Duke Draw! check execution
  public static executeDrawCheck(
    state: SimulationState,
    player: EnginePlayer,
    reason: LuckyDukeReason,
    condition: (card: EngineCard, state: SimulationState) => boolean,
    luckyMeta?: {
      judgementCard?: EngineCard;
      judgementId?: string;
      sourceReactionId?: string;
    }
  ): {
    pendingInteraction?: LuckyDukePickState;
    success: boolean;
    drawnCards: EngineCard[];
    chosenCard?: EngineCard;
    events: DomainEvent[];
  } {
    const events: DomainEvent[] = [];
    const isLuckyDuke = SkillHooks.hasSkill(player, "Lucky Duke", state);
    const count = isLuckyDuke ? 2 : 1;
    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, count);
    events.push(...drawEvents);

    if (isLuckyDuke && drawn.length === 2) {
      const pickState: LuckyDukePickState = {
        type: "LUCKY_DUKE_PICK",
        playerId: player.id,
        reason,
        drawnCards: drawn,
        ...(luckyMeta?.judgementCard ? { judgementCard: luckyMeta.judgementCard } : {}),
        ...(luckyMeta?.judgementId ? { judgementId: luckyMeta.judgementId } : {}),
        ...(luckyMeta?.sourceReactionId ? { sourceReactionId: luckyMeta.sourceReactionId } : {}),
      };
      state.activeChain.push(pickState);
      events.push({
        type: "LUCKY_DUKE_DRAW_PENDING",
        payload: {
          playerId: player.id,
          playerName: player.name,
          reason,
          drawnCards: drawn,
        },
        timestamp: Date.now(),
      });
      return {
        pendingInteraction: pickState,
        success: false,
        drawnCards: drawn,
        events,
      };
    }

    const chosenCard: EngineCard | undefined = drawn[0];
    const success = chosenCard ? condition(chosenCard, state) : false;

    DeckManager.discardCardsRespectingMine(state, drawn);
    SkillHooks.emitDrawCheckResult(
      state,
      player,
      reason,
      isLuckyDuke,
      drawn,
      chosenCard,
      success,
      events
    );

    return { success, drawnCards: drawn, chosenCard, events };
  }

  // Suzy Lafayette empty hand draw
  public static checkSuzyLafayette(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    if (player.isDead || player.handCards.length > 0) return;
    if (!player.isGhost && player.hp <= 0) return;
    if (!SkillHooks.hasSkill(player, "Suzy Lafayette", state)) return;

    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, 1);
    events.push(...drawEvents);

    if (drawn.length === 0) return;
    player.handCards.push(...drawn);
    events.push({
      type: "SUZY_LAFAYETTE_TRIGGERED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        drawnCount: drawn.length,
      },
      timestamp: Date.now(),
    });
  }

  // Bart Cassidy and El Gringo
  public static onTakeDamage(
    state: SimulationState,
    victim: EnginePlayer,
    attacker: EnginePlayer | undefined | null,
    damageAmount: number,
    events: DomainEvent[]
  ): void {
    if (damageAmount <= 0 || victim.isDead || victim.isGhost || victim.hp <= 0) {
      return;
    }

    if (SkillHooks.hasSkill(victim, "Bart Cassidy", state)) {
      const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, damageAmount);
      events.push(...drawEvents);
      if (drawn.length > 0) {
        victim.handCards.push(...drawn);
        events.push({
          type: "BART_CASSIDY_TRIGGERED",
          payload: {
            playerId: victim.id,
            drawnCount: drawn.length,
          },
          timestamp: Date.now(),
        });
      }
    }

    if (
      SkillHooks.hasSkill(victim, "El Gringo", state) &&
      attacker &&
      attacker.id !== victim.id &&
      !attacker.isDead &&
      attacker.handCards.length > 0
    ) {
      const remainingSteals = Math.min(damageAmount, attacker.handCards.length);
      const gringoState: ElGringoPickState = {
        type: "EL_GRINGO_PICK",
        victimId: victim.id,
        attackerId: attacker.id,
        remainingSteals,
      };
      state.activeChain.push(gringoState);
      events.push({
        type: "EL_GRINGO_PICK_PENDING",
        payload: {
          victimId: victim.id,
          victimName: victim.name,
          attackerId: attacker.id,
          attackerName: attacker.name,
          remainingSteals,
        },
        timestamp: Date.now(),
      });
    }
  }

  // Molly Stark out-of-turn draw
  public static onPlayOutOfTurn(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[],
    count: number = 1
  ): void {
    if (
      player.isDead ||
      (!player.isGhost && player.hp <= 0) ||
      state.turnPlayerId === player.id ||
      count <= 0
    ) {
      return;
    }
    if (!SkillHooks.hasSkill(player, "Molly Stark", state)) return;

    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, count);
    events.push(...drawEvents);

    if (drawn.length === 0) return;
    player.handCards.push(...drawn);
    events.push({
      type: "MOLLY_STARK_TRIGGERED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        drawnCount: drawn.length,
      },
      timestamp: Date.now(),
    });
  }

  // Queue Molly Stark deferred draw
  public static queueDeferredMollyDraw(
    state: SimulationState,
    reaction: PendingReaction,
    player: EnginePlayer
  ): void {
    if (player.isDead || (!player.isGhost && player.hp <= 0)) return;
    if (state.turnPlayerId === player.id) return;
    if (!SkillHooks.hasSkill(player, "Molly Stark", state)) return;
    if (!reaction.deferredMollyDraws) {
      reaction.deferredMollyDraws = {};
    }
    reaction.deferredMollyDraws[player.id] =
      (reaction.deferredMollyDraws[player.id] ?? 0) + 1;
  }

  // Flush or forward Molly draws
  public static flushDeferredMollyDraws(
    state: SimulationState,
    reaction: PendingReaction,
    events: DomainEvent[]
  ): void {
    const deferred = reaction.deferredMollyDraws;
    if (!deferred) return;
    for (const [pid, count] of Object.entries(deferred)) {
      if (count <= 0) continue;
      const targetPlayer = state.players.get(pid);
      if (!targetPlayer || targetPlayer.isDead) continue;

      if (!targetPlayer.isGhost && targetPlayer.hp <= 0) {
        const rescue = state.pendingReactions.find(
          (r) => r.type === "NEAR_DEATH_RESCUE" && r.targetPlayerId === pid
        );
        if (rescue) {
          if (!rescue.deferredMollyDraws) rescue.deferredMollyDraws = {};
          rescue.deferredMollyDraws[pid] =
            (rescue.deferredMollyDraws[pid] ?? 0) + count;
        }
        continue;
      }

      SkillHooks.onPlayOutOfTurn(state, targetPlayer, events, count);
    }
    delete reaction.deferredMollyDraws;
  }

  // Sid Ketchum near-death rescue check
  public static canSidKetchumRescue(
    state: SimulationState,
    victim: EnginePlayer
  ): boolean {
    if (victim.isDead || victim.isGhost) return false;
    return (
      SkillHooks.hasSkill(victim, "Sid Ketchum", state) &&
      victim.handCards.length >= 2
    );
  }

  // Vera Custer turn-start copy resolution
  public static resolveVeraCusterCopy(
    state: SimulationState,
    player: EnginePlayer,
    targetCharId: string,
    events: DomainEvent[]
  ): CommandResult {
    const pending = state.pendingTurnStartChoice;
    if (
      !pending ||
      pending.type !== "VERA_CUSTER_COPY" ||
      pending.playerId !== player.id
    ) {
      return {
        success: false,
        message: "No pending Vera Custer copy choice for this player.",
      };
    }

    const chosen = pending.availableCharacters?.find(
      (entry) =>
        entry.character.id === targetCharId ||
        entry.character.name.toLowerCase() === targetCharId.toLowerCase()
    );
    if (!chosen) {
      return { success: false, message: "Invalid target character to copy." };
    }

    player.copiedCharacter = { ...chosen.character };
    state.pendingTurnStartChoice = null;

    events.push({
      type: "VERA_CUSTER_COPIED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        copiedCharacter: player.copiedCharacter,
        sourceOwnerPlayerId: chosen.ownerPlayerId,
        sourceOwnerName: chosen.ownerName,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }

  // Active character skills facade
  public static handleActiveSkill(
    state: SimulationState,
    command: PlayerCommand,
    events: DomainEvent[],
    deckManager?: DeckManager
  ): CommandResult {
    const { ActiveSkills } = require("./handlers/active_skills") as typeof import("./handlers/active_skills");
    return ActiveSkills.handleActiveSkill(state, command, events, deckManager);
  }
}
