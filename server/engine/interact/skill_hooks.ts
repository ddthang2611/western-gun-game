import crypto from "crypto";
import { EnginePlayer, SimulationState } from "../types/state";
import { EngineCard, Suit } from "../types/cards";
import { CommandResult, DomainEvent, PlayerCommand } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { TargetValidator } from "../combat/target_validator";
import { PendingReaction } from "./interact_types";
import { EventRuleRegistry } from "../events/event_rule_registry";

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
      SkillHooks.hasSkill(activeTurn, "Belle Star", state)
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
    if (card.name === "BANG!" && SkillHooks.hasSkill(attacker, "Slab the Killer", state)) {
      return 2;
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
    if (SkillHooks.hasSkill(defender, "Apache Kid", state) && suit === "diamonds") {
      return true;
    }
    return false;
  }

  // Calamity Janet and Elena Fuente
  public static canSubstituteCard(
    player: EnginePlayer,
    card: EngineCard,
    targetRole: "BANG" | "MISSED",
    state?: SimulationState
  ): boolean {
    if (targetRole === "MISSED" && SkillHooks.hasSkill(player, "Elena Fuente", state)) {
      return true;
    }

    if (SkillHooks.hasSkill(player, "Calamity Janet", state)) {
      if (targetRole === "MISSED" && card.name === "BANG!") return true;
      if (targetRole === "BANG" && card.name === "MISSED!") return true;
    }

    return false;
  }

  // Jourdonnais innate Barrel check
  public static hasInnateBarrel(player: EnginePlayer, state?: SimulationState): boolean {
    return SkillHooks.hasSkill(player, "Jourdonnais", state);
  }

  // Willy the Kid unlimited BANG!
  public static hasUnlimitedBang(player: EnginePlayer, state?: SimulationState): boolean {
    return SkillHooks.hasSkill(player, "Willy the Kid", state);
  }

  // Paul Regret defense distance bonus
  public static getDistanceDefenseBonus(
    defender: EnginePlayer,
    state?: SimulationState
  ): number {
    return SkillHooks.hasSkill(defender, "Paul Regret", state) ? 1 : 0;
  }

  // Rose Doolan offense distance bonus
  public static getDistanceOffenseBonus(
    attacker: EnginePlayer,
    state?: SimulationState
  ): number {
    return SkillHooks.hasSkill(attacker, "Rose Doolan", state) ? -1 : 0;
  }

  // Sean Mallory end-turn hand limit
  public static getPhase3HandLimit(
    player: EnginePlayer,
    state?: SimulationState
  ): number {
    return SkillHooks.hasSkill(player, "Sean Mallory", state) ? 10 : player.hp;
  }

  // Tequila Joe Beer heal amount
  public static getBeerHealAmount(
    player: EnginePlayer,
    state?: SimulationState
  ): number {
    return SkillHooks.hasSkill(player, "Tequila Joe", state) ? 2 : 1;
  }

  // Lucky Duke Draw! check execution
  public static executeDrawCheck(
    state: SimulationState,
    player: EnginePlayer,
    reason: string,
    condition: (card: EngineCard, state: SimulationState) => boolean
  ): {
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

    let chosenCard: EngineCard | undefined = drawn[0];
    let success = false;

    if (drawn.length > 0) {
      success = condition(drawn[0], state);
      if (!success && isLuckyDuke && drawn.length > 1) {
        if (condition(drawn[1], state)) {
          chosenCard = drawn[1];
          success = true;
        }
      }
    }

    for (const card of drawn) {
      DeckManager.discardCard(state, card);
    }

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
        success,
        isSuccess: success,
      },
      timestamp: Date.now(),
    });

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
        drawnCardId: drawn[0].id,
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
      !attacker.isDead
    ) {
      for (let i = 0; i < damageAmount; i++) {
        if (attacker.handCards.length === 0) break;
        const randIdx = crypto.randomInt(0, attacker.handCards.length);
        const stolenCard = attacker.handCards.splice(randIdx, 1)[0];
        victim.handCards.push(stolenCard);

        events.push({
          type: "EL_GRINGO_STOLEN",
          visibleTo: [victim.id, attacker.id],
          payload: {
            victimId: victim.id,
            attackerId: attacker.id,
            card: stolenCard,
          },
          maskedPayload: {
            victimId: victim.id,
            attackerId: attacker.id,
            card: {
              id: "SECRET",
              name: "Card from hand",
              suit: "UNKNOWN",
              rank: "UNKNOWN",
            },
          },
          timestamp: Date.now(),
        });
      }

      SkillHooks.checkSuzyLafayette(state, attacker, events);
    }
  }

  // Molly Stark out-of-turn draw
  public static onPlayOutOfTurn(
    state: SimulationState,
    player: EnginePlayer,
    events: DomainEvent[]
  ): void {
    if (player.isDead || state.turnPlayerId === player.id) return;
    if (!SkillHooks.hasSkill(player, "Molly Stark", state)) return;

    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, 1);
    events.push(...drawEvents);

    if (drawn.length === 0) return;
    player.handCards.push(...drawn);
    events.push({
      type: "MOLLY_STARK_TRIGGERED",
      payload: {
        playerId: player.id,
        drawnCount: drawn.length,
      },
      timestamp: Date.now(),
    });
  }

  // Greg Digger and Herb Hunter
  public static onPlayerEliminated(
    state: SimulationState,
    deadPlayer: EnginePlayer,
    events: DomainEvent[]
  ): void {
    state.players.forEach((player) => {
      if (player.isDead || player.id === deadPlayer.id) return;

      if (!player.isGhost && player.hp > 0 && SkillHooks.hasSkill(player, "Greg Digger", state)) {
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

      if (SkillHooks.hasSkill(player, "Herb Hunter", state)) {
        const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, 2);
        events.push(...drawEvents);
        if (drawn.length > 0) {
          player.handCards.push(...drawn);
          events.push({
            type: "HERB_HUNTER_DRAW",
            payload: {
              playerId: player.id,
              playerName: player.name,
              drawnCount: drawn.length,
            },
            timestamp: Date.now(),
          });
        }
      }
    });
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

  // Active character skills handler
  public static handleActiveSkill(
    state: SimulationState,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    const skillType = String(
      command.payload?.skillType ?? command.payload?.skill ?? ""
    );

    if (skillType === "SID_KETCHUM_HEAL") {
      return SkillHooks.handleSidKetchumHeal(state, player, command, events);
    }

    if (skillType === "CHUCK_WENGAM_HP" || skillType === "CHUCK_WENGAM_SACRIFICE") {
      return SkillHooks.handleChuckWengamHp(state, player, skillType, events);
    }

    if (skillType === "JOSE_DELGADO_DRAW") {
      return SkillHooks.handleJoseDelgadoDraw(state, player, command, events);
    }

    if (skillType === "DOC_HOLYDAY_BANG") {
      return SkillHooks.handleDocHolydayBang(state, player, command, events);
    }

    return { success: false, message: `Unknown active skill: ${skillType}` };
  }

  private static handleSidKetchumHeal(
    state: SimulationState,
    player: EnginePlayer,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    if (player.isGhost) {
      return { success: false, message: "Ghosts have no life points." };
    }
    if (!SkillHooks.hasSkill(player, "Sid Ketchum", state)) {
      return { success: false, message: "Player does not have Sid Ketchum ability." };
    }
    if (player.hp >= player.maxHp) {
      return { success: false, message: "Player already at maximum HP." };
    }

    const discardIds = SkillHooks.extractTwoDistinctIds(
      command.discardCardIds ?? command.payload?.discardCardIds
    );
    if (!discardIds) {
      return {
        success: false,
        message: "Exactly 2 distinct cards required for Sid Ketchum.",
      };
    }

    const discarded = SkillHooks.removeHandCards(player, discardIds);
    if (!discarded) {
      return { success: false, message: "Selected cards not found in hand." };
    }

    for (const card of discarded) {
      DeckManager.discardCard(state, card);
    }
    player.hp = Math.min(player.hp + 1, player.maxHp);

    events.push({
      type: "ACTIVE_SKILL_USED",
      payload: {
        playerId: player.id,
        skill: "SID_KETCHUM_HEAL",
        discardedCount: 2,
        currentHp: player.hp,
      },
      timestamp: Date.now(),
    });
    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }

  private static handleChuckWengamHp(
    state: SimulationState,
    player: EnginePlayer,
    skillName: string,
    events: DomainEvent[]
  ): CommandResult {
    if (!SkillHooks.hasSkill(player, "Chuck Wengam", state)) {
      return { success: false, message: "Player does not have Chuck Wengam ability." };
    }
    if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
      return {
        success: false,
        message: "Chuck Wengam ability requires Phase 2 of your turn.",
      };
    }
    if (player.isGhost || player.hp <= 1) {
      return { success: false, message: "Cannot sacrifice last HP." };
    }

    player.hp -= 1;
    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, 2);
    events.push(...drawEvents);
    player.handCards.push(...drawn);

    events.push({
      type: "ACTIVE_SKILL_USED",
      payload: {
        playerId: player.id,
        skill: skillName,
        currentHp: player.hp,
        drawnCount: drawn.length,
      },
      timestamp: Date.now(),
    });
    SkillHooks.onTakeDamage(state, player, undefined, 1, events);
    return { success: true, events };
  }

  private static handleJoseDelgadoDraw(
    state: SimulationState,
    player: EnginePlayer,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    if (!SkillHooks.hasSkill(player, "Jose Delgado", state)) {
      return { success: false, message: "Player does not have Jose Delgado ability." };
    }
    if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
      return {
        success: false,
        message: "Jose Delgado ability requires Phase 2 of your turn.",
      };
    }
    if (state.joseDelgadoCountThisTurn >= 2) {
      return {
        success: false,
        message: "Jose Delgado can only be used twice per turn.",
      };
    }

    const blueCardId =
      command.cardId ?? command.discardCardIds?.[0] ?? command.payload?.cardId;
    if (typeof blueCardId !== "string" || !blueCardId) {
      return { success: false, message: "Blue card ID required." };
    }

    const cardIdx = player.handCards.findIndex((c) => c.id === blueCardId);
    if (cardIdx === -1) return { success: false, message: "Card not in hand." };

    const card = player.handCards[cardIdx];
    if (card.border !== "blue") {
      return { success: false, message: "Must discard a blue card." };
    }

    player.handCards.splice(cardIdx, 1);
    DeckManager.discardCard(state, card);
    state.joseDelgadoCountThisTurn += 1;

    SkillHooks.checkSuzyLafayette(state, player, events);

    const { cards: drawn, events: drawEvents } = DeckManager.drawCards(state, 2);
    events.push(...drawEvents);
    player.handCards.push(...drawn);

    events.push({
      type: "ACTIVE_SKILL_USED",
      payload: {
        playerId: player.id,
        skill: "JOSE_DELGADO_DRAW",
        discardedCardId: card.id,
        drawnCount: drawn.length,
        usesThisTurn: state.joseDelgadoCountThisTurn,
      },
      timestamp: Date.now(),
    });
    return { success: true, events };
  }

  private static handleDocHolydayBang(
    state: SimulationState,
    player: EnginePlayer,
    command: PlayerCommand,
    events: DomainEvent[]
  ): CommandResult {
    if (!SkillHooks.hasSkill(player, "Doc Holyday", state)) {
      return { success: false, message: "Player does not have Doc Holyday ability." };
    }
    if (state.turnPlayerId !== player.id || state.currentPhase !== 2) {
      return {
        success: false,
        message: "Doc Holyday ability requires Phase 2 of your turn.",
      };
    }
    if (state.docHolydayUsedThisTurn >= 1) {
      return {
        success: false,
        message: "Doc Holyday ability can only be used once per turn.",
      };
    }

    const discardIds = SkillHooks.extractTwoDistinctIds(
      command.discardCardIds ?? command.payload?.discardCardIds
    );
    if (!discardIds) {
      return {
        success: false,
        message: "Exactly 2 distinct cards required for Doc Holyday.",
      };
    }

    const hasBoth = discardIds.every((id) =>
      player.handCards.some((c) => c.id === id)
    );
    if (!hasBoth) {
      return { success: false, message: "Selected discard cards not found in hand." };
    }

    const targetPlayerId = command.targetPlayerId ?? command.payload?.targetPlayerId;
    if (typeof targetPlayerId !== "string" || !targetPlayerId) {
      return { success: false, message: "Target player is required." };
    }

    const target = state.players.get(targetPlayerId);
    const previewCard: EngineCard = {
      id: `doc_holyday_${Date.now()}`,
      seq: 0,
      templateId: "base_bang",
      pack: "base",
      name: "BANG!",
      border: "brown",
      category: "action",
      rank: "A",
      suit: "clubs",
      desc: "",
    };

    const validation = TargetValidator.validate(state, previewCard, player, target, {
      requiresRange: true,
    });
    if (!validation.valid || !target) {
      return {
        success: false,
        message: validation.reason ?? "Invalid target for Doc Holyday.",
      };
    }

    const discarded = SkillHooks.removeHandCards(player, discardIds);
    if (!discarded) {
      return { success: false, message: "Selected discard cards not found in hand." };
    }
    for (const card of discarded) {
      DeckManager.discardCard(state, card);
    }

    state.docHolydayUsedThisTurn += 1;
    SkillHooks.checkSuzyLafayette(state, player, events);

    const requiredCount = SkillHooks.hasSkill(player, "Slab the Killer", state) ? 2 : 1;
    const equipEffective = SkillHooks.isEquipmentEffective(target, player, state);
    const canUseBarrel =
      equipEffective &&
      Boolean(
        target.equipments.barrel ||
          target.equipments.extra?.name === "BARREL" ||
          target.equipments.extras?.some((c) => c.name === "BARREL")
      );
    const canUseJourdonnais = SkillHooks.hasInnateBarrel(target, state);

    // Suitless skill avoids Apache Kid
    const sourceCard: EngineCard = {
      ...discarded[0],
      name: "BANG!",
      suit: "clubs",
    };

    const reaction: PendingReaction = {
      id: `react_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "BANG_DEFENSE",
      sourcePlayerId: player.id,
      targetPlayerId: target.id,
      sourceCard,
      requiredCard: "MISSED",
      requiredCount,
      currentCount: 0,
      canUseBarrel,
      canUseJourdonnais,
      barrelChecked: false,
      jourdonnaisChecked: false,
      createdAt: Date.now(),
    };
    state.pendingReactions.push(reaction);

    events.push({
      type: "DOC_HOLYDAY_BANG",
      payload: {
        playerId: player.id,
        attackerId: player.id,
        playerName: player.name,
        targetId: target.id,
        targetPlayerId: target.id,
        targetName: target.name,
        discardedCardIds: discarded.map((c) => c.id),
        requiredMissedCount: requiredCount,
        canUseBarrel,
        canUseJourdonnais,
      },
      timestamp: Date.now(),
    });

    return { success: true, events };
  }

  private static extractTwoDistinctIds(raw: unknown): [string, string] | null {
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    const [first, second] = raw;
    if (typeof first !== "string" || typeof second !== "string") return null;
    if (!first || !second || first === second) return null;
    return [first, second];
  }

  private static removeHandCards(
    player: EnginePlayer,
    cardIds: string[]
  ): EngineCard[] | null {
    const idSet = new Set(cardIds);
    const matched = player.handCards.filter((c) => idSet.has(c.id));
    if (matched.length !== cardIds.length) return null;
    player.handCards = player.handCards.filter((c) => !idSet.has(c.id));
    return matched;
  }
}
