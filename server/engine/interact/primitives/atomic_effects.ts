import crypto from "crypto";
import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard } from "../../types/cards";
import { DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { SeatManager } from "../../board/seat_manager";
import { EliminationHandler } from "../../elimination/elimination_handler";
import { TargetArea } from "../../combat/target_validator";
import { SkillHooks } from "../skill_hooks";
import { PendingReaction, ReactionConfig } from "../interact_types";
import { EventRuleRegistry } from "../../events/event_rule_registry";

export interface DamageResult {
  events: DomainEvent[];
  isEliminated: boolean;
  isRevived: boolean;
  finalHp: number;
}

export interface HealResult {
  events: DomainEvent[];
  actualHeal: number;
  finalHp: number;
}

export interface ReactionCreateResult {
  events: DomainEvent[];
  isImmune: boolean;
  reaction?: PendingReaction;
}

export class AtomicEffects {
  // Draw cards from state deck
  public static drawCards(
    state: SimulationState,
    count: number,
    deckManager?: DeckManager
  ): { cards: EngineCard[]; events: DomainEvent[]; reshuffled: boolean } {
    if (deckManager) {
      const res = deckManager.draw(count);
      return {
        cards: res.cards,
        events: res.events,
        reshuffled: res.events.some((e) => e.type === "DECK_RESHUFFLED"),
      };
    }
    return DeckManager.drawCards(state, count);
  }

  // Discard card respecting Abandoned Mine
  public static discardCard(
    state: SimulationState,
    card: EngineCard,
    deckManager?: DeckManager
  ): void {
    if (state.activeEvent?.effectCode === "EVENT_FOC_ABANDONED_MINE") {
      if (deckManager) {
        deckManager.placeOnTopOfDeck(card);
      } else {
        DeckManager.placeOnTopOfDeck(state, card);
      }
      return;
    }

    if (deckManager) {
      deckManager.discard(card);
    } else {
      DeckManager.discardCard(state, card);
    }
  }

  // Discard multiple cards safely
  public static discardCards(
    state: SimulationState,
    cards: EngineCard[],
    deckManager?: DeckManager
  ): void {
    for (const card of cards) {
      this.discardCard(state, card, deckManager);
    }
  }

  // Extract card from target area
  private static extractTargetCard(
    victim: EnginePlayer,
    targetArea: TargetArea,
    targetCardId?: string
  ): EngineCard | null {
    if (targetArea === "HAND") {
      if (victim.handCards.length === 0) return null;
      const randIdx = crypto.randomInt(0, victim.handCards.length);
      return victim.handCards.splice(randIdx, 1)[0];
    }

    if (targetArea === "EQUIPMENT") {
      const eq = victim.equipments;
      if (!eq) return null;

      if (targetCardId) {
        if (eq.weapon?.id === targetCardId) {
          const card = eq.weapon;
          eq.weapon = undefined;
          return card;
        }
        if (eq.horseDef?.id === targetCardId) {
          const card = eq.horseDef;
          eq.horseDef = undefined;
          return card;
        }
        if (eq.horseOff?.id === targetCardId) {
          const card = eq.horseOff;
          eq.horseOff = undefined;
          return card;
        }
        if (eq.barrel?.id === targetCardId) {
          const card = eq.barrel;
          eq.barrel = undefined;
          return card;
        }
        if (eq.extras && eq.extras.length > 0) {
          const extraIdx = eq.extras.findIndex((c) => c.id === targetCardId);
          if (extraIdx !== -1) {
            const card = eq.extras.splice(extraIdx, 1)[0];
            eq.extra = eq.extras[0];
            return card;
          }
        }
        if (eq.extra?.id === targetCardId) {
          const card = eq.extra;
          eq.extra = eq.extras?.[0];
          return card;
        }
        return null;
      }

      if (eq.weapon) {
        const card = eq.weapon;
        eq.weapon = undefined;
        return card;
      }
      if (eq.horseDef) {
        const card = eq.horseDef;
        eq.horseDef = undefined;
        return card;
      }
      if (eq.horseOff) {
        const card = eq.horseOff;
        eq.horseOff = undefined;
        return card;
      }
      if (eq.barrel) {
        const card = eq.barrel;
        eq.barrel = undefined;
        return card;
      }
      if (eq.extras && eq.extras.length > 0) {
        const card = eq.extras.shift()!;
        eq.extra = eq.extras[0];
        return card;
      }
      if (eq.extra) {
        const card = eq.extra;
        eq.extra = undefined;
        return card;
      }
      return null;
    }

    if (targetArea === "GREEN") {
      const greenCards = victim.greenCards || [];
      const idx = targetCardId
        ? greenCards.findIndex((g) => g.id === targetCardId || g.card.id === targetCardId)
        : greenCards.length > 0
        ? 0
        : -1;
      if (idx === -1) return null;
      return greenCards.splice(idx, 1)[0].card;
    }

    if (targetArea === "JUDGEMENT") {
      const judgements = victim.judgements || [];
      const idx = targetCardId
        ? judgements.findIndex((j) => j.id === targetCardId || j.card.id === targetCardId)
        : judgements.length > 0
        ? 0
        : -1;
      if (idx === -1) return null;
      return judgements.splice(idx, 1)[0].card;
    }

    return null;
  }

  // Emit theft or destruction event
  private static emitAreaTransferEvent(
    actor: EnginePlayer,
    victim: EnginePlayer,
    targetArea: TargetArea,
    card: EngineCard,
    isSteal: boolean,
    events: DomainEvent[]
  ): void {
    if (targetArea === "HAND") {
      events.push({
        type: isSteal ? "CARD_STOLEN_FROM_HAND" : "CARD_DESTROYED_FROM_HAND",
        visibleTo: [actor.id, victim.id],
        payload: {
          sourcePlayerId: actor.id,
          sourcePlayerName: actor.name,
          targetPlayerId: victim.id,
          targetPlayerName: victim.name,
          card,
          action: isSteal ? "STEAL" : "DESTROY",
        },
        maskedPayload: {
          sourcePlayerId: actor.id,
          sourcePlayerName: actor.name,
          targetPlayerId: victim.id,
          targetPlayerName: victim.name,
          card: {
            id: "SECRET",
            name: "Card from hand",
            suit: "UNKNOWN",
            rank: "UNKNOWN",
          },
          action: isSteal ? "STEAL" : "DESTROY",
        },
        timestamp: Date.now(),
      });
      return;
    }

    const typeMap: Record<Exclude<TargetArea, "HAND">, [string, string]> = {
      EQUIPMENT: ["EQUIPMENT_STOLEN", "EQUIPMENT_DESTROYED"],
      GREEN: ["GREEN_CARD_STOLEN", "GREEN_CARD_DESTROYED"],
      JUDGEMENT: ["JUDGEMENT_STOLEN", "JUDGEMENT_DESTROYED"],
    };

    events.push({
      type: isSteal ? typeMap[targetArea][0] : typeMap[targetArea][1],
      payload: {
        sourcePlayerId: actor.id,
        targetPlayerId: victim.id,
        card,
      },
      timestamp: Date.now(),
    });
  }

  // Steal card from victim area
  public static stealCard(
    state: SimulationState,
    thief: EnginePlayer,
    victim: EnginePlayer,
    targetArea: TargetArea,
    targetCardId: string | undefined,
    events: DomainEvent[],
    _deckManager?: DeckManager
  ): EngineCard | null {
    const card = this.extractTargetCard(victim, targetArea, targetCardId);
    if (!card) return null;

    thief.handCards.push(card);
    this.emitAreaTransferEvent(thief, victim, targetArea, card, true, events);

    if (targetArea === "HAND") {
      SkillHooks.checkSuzyLafayette(state, victim, events);
    }

    return card;
  }

  // Destroy card from victim area
  public static destroyCard(
    state: SimulationState,
    destroyer: EnginePlayer,
    victim: EnginePlayer,
    targetArea: TargetArea,
    targetCardId: string | undefined,
    events: DomainEvent[],
    deckManager?: DeckManager
  ): EngineCard | null {
    const card = this.extractTargetCard(victim, targetArea, targetCardId);
    if (!card) return null;

    this.discardCard(state, card, deckManager);
    this.emitAreaTransferEvent(destroyer, victim, targetArea, card, false, events);

    if (targetArea === "HAND") {
      SkillHooks.checkSuzyLafayette(state, victim, events);
    }

    return card;
  }

  // Apply damage and handle survival
  public static applyDamage(
    state: SimulationState,
    attacker: EnginePlayer | undefined,
    victim: EnginePlayer,
    damageAmount: number,
    events: DomainEvent[] = [],
    sourceCard?: EngineCard,
    deckManager?: DeckManager
  ): DamageResult {
    if (victim.isDead || damageAmount <= 0) {
      return {
        events,
        isEliminated: false,
        isRevived: false,
        finalHp: victim.hp,
      };
    }

    if (victim.isGhost) {
      events.push({
        type: "GHOST_IMMUNE_TO_DEATH",
        payload: {
          playerId: victim.id,
          playerName: victim.name,
          damageAttempted: damageAmount,
        },
        timestamp: Date.now(),
      });
      return {
        events,
        isEliminated: false,
        isRevived: false,
        finalHp: victim.hp,
      };
    }

    victim.hp -= damageAmount;
    events.push({
      type: "PLAYER_DAMAGED",
      payload: {
        victimId: victim.id,
        victimName: victim.name,
        attackerId: attacker?.id,
        attackerName: attacker?.name,
        currentHp: victim.hp,
        damage: damageAmount,
        sourceCard,
      },
      timestamp: Date.now(),
    });

    let isRevived = false;
    const canBeerRevive =
      SeatManager.getLivingContenders(state).length > 2 &&
      !EventRuleRegistry.disablesBeerRescue(state);

    // Auto-revive with Beer when lethal
    while (victim.hp <= 0 && canBeerRevive) {
      const beerIdx = victim.handCards.findIndex((c) => c.name === "BEER");
      if (beerIdx === -1) break;

      const beerCard = victim.handCards.splice(beerIdx, 1)[0];
      this.discardCard(state, beerCard, deckManager);

      const healAmount = SkillHooks.getBeerHealAmount(victim, state);
      victim.hp = Math.min(victim.hp + healAmount, victim.maxHp);

      SkillHooks.onPlayOutOfTurn(state, victim, events);
      events.push({
        type: "FATAL_DAMAGE_REVIVED_WITH_BEER",
        payload: {
          playerId: victim.id,
          playerName: victim.name,
          card: beerCard,
          healedAmount: healAmount,
          currentHp: victim.hp,
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, victim, events);

      if (victim.hp > 0) {
        isRevived = true;
      }
    }

    // Queue Sid Ketchum near-death rescue
    if (victim.hp <= 0 && SkillHooks.canSidKetchumRescue(state, victim)) {
      const rescueReaction: PendingReaction = {
        id: `reaction_sid_rescue_${victim.id}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        type: "NEAR_DEATH_RESCUE",
        sourcePlayerId: attacker?.id ?? "ENV_DAMAGE",
        targetPlayerId: victim.id,
        sourceCard:
          victim.handCards[0] ?? {
            id: "sid_rescue",
            seq: 0,
            templateId: "sid_rescue",
            pack: "base",
            name: "SID_RESCUE",
            border: "brown",
            category: "reaction",
            rank: "A",
            suit: "hearts",
            desc: "Sid Ketchum rescue",
          },
        requiredCard: "SID_RESCUE",
        requiredCount: 1,
        currentCount: 0,
        canUseBarrel: false,
        canUseJourdonnais: false,
        barrelChecked: false,
        jourdonnaisChecked: false,
        pendingDamage: Math.abs(victim.hp) + 1,
        createdAt: Date.now(),
      };
      state.pendingReactions.unshift(rescueReaction);

      events.push({
        type: "SID_KETCHUM_RESCUE_PENDING",
        payload: {
          playerId: victim.id,
          playerName: victim.name,
          neededHeal: Math.abs(victim.hp) + 1,
        },
        timestamp: Date.now(),
      });

      return {
        events,
        isEliminated: false,
        isRevived: false,
        finalHp: victim.hp,
      };
    }

    if (victim.hp > 0) {
      SkillHooks.onTakeDamage(state, victim, attacker, damageAmount, events);
      SkillHooks.checkSuzyLafayette(state, victim, events);
      return {
        events,
        isEliminated: false,
        isRevived,
        finalHp: victim.hp,
      };
    }

    const elimResult = EliminationHandler.handleElimination(
      state,
      victim,
      attacker,
      deckManager
    );
    events.push(...elimResult.events);

    return {
      events,
      isEliminated: true,
      isRevived: false,
      finalHp: victim.hp,
    };
  }

  // Heal non-ghost player HP
  public static applyHeal(
    state: SimulationState,
    target: EnginePlayer,
    amount: number,
    sourceCard?: EngineCard,
    events: DomainEvent[] = [],
    _deckManager?: DeckManager
  ): HealResult {
    if (target.isDead || target.isGhost || target.hp >= target.maxHp || amount <= 0) {
      return { events, actualHeal: 0, finalHp: target.hp };
    }

    const healAmount =
      sourceCard?.name === "BEER"
        ? SkillHooks.getBeerHealAmount(target, state)
        : amount;

    const actualHeal = Math.min(healAmount, target.maxHp - target.hp);
    target.hp += actualHeal;

    events.push({
      type: "HEAL_RESOLVED",
      payload: {
        playerId: target.id,
        playerName: target.name,
        sourceCard,
        healedAmount: actualHeal,
        currentHp: target.hp,
        maxHp: target.maxHp,
      },
      timestamp: Date.now(),
    });

    return {
      events,
      actualHeal,
      finalHp: target.hp,
    };
  }

  // Create pending reaction on target
  public static createReaction(
    state: SimulationState,
    target: EnginePlayer,
    attacker: EnginePlayer | undefined,
    sourceCard: EngineCard,
    config: ReactionConfig,
    overrides?: Partial<PendingReaction>
  ): ReactionCreateResult {
    const events: DomainEvent[] = [];

    if (SkillHooks.isImmuneToCard(target, sourceCard, attacker, state)) {
      events.push({
        type: "APACHE_KID_IMMUNITY",
        payload: {
          sourcePlayerId: attacker?.id,
          targetPlayerId: target.id,
          playerId: target.id,
          card: sourceCard,
        },
        timestamp: Date.now(),
      });
      return { events, isImmune: true };
    }

    const turnPlayer = state.players.get(state.turnPlayerId);
    const equipEffective = SkillHooks.isEquipmentEffective(
      target,
      turnPlayer ?? attacker,
      state
    );
    const hasBarrelCard = Boolean(
      target.equipments.barrel ||
        target.equipments.extra?.name === "BARREL" ||
        target.equipments.extras?.some((c) => c.name === "BARREL")
    );
    const hasBarrel = Boolean(config.allowBarrel) && equipEffective && hasBarrelCard;
    const hasJourdonnais =
      Boolean(config.allowJourdonnais) && SkillHooks.hasInnateBarrel(target, state);

    let reqCount = config.requiredCount ?? 1;
    if (
      attacker &&
      config.type === "BANG_DEFENSE" &&
      config.requiredCard === "MISSED" &&
      config.requiredCount === undefined
    ) {
      if (sourceCard.name === "BANG!") {
        reqCount = SkillHooks.getMissedRequiredForAttack(attacker, sourceCard, state);
      } else if (
        sourceCard.name === "MISSED!" &&
        SkillHooks.hasSkill(attacker, "Slab the Killer", state)
      ) {
        reqCount = 2;
      }
    }

    const reaction: PendingReaction = {
      id: `reaction_${config.type.toLowerCase()}_${target.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      type: config.type,
      sourcePlayerId: attacker?.id || "SYSTEM",
      targetPlayerId: target.id,
      sourceCard,
      requiredCard: config.requiredCard,
      requiredCount: reqCount,
      currentCount: 0,
      canUseBarrel: hasBarrel,
      canUseJourdonnais: hasJourdonnais,
      barrelChecked: false,
      jourdonnaisChecked: false,
      createdAt: Date.now(),
      ...overrides,
    };

    state.pendingReactions.push(reaction);

    return {
      events,
      isImmune: false,
      reaction,
    };
  }
}
