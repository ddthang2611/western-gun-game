import {
  ArenaOriginZone,
  ArenaVfxType,
  EnginePlayer,
  EquipmentSlotKey,
  SimulationState,
} from "../types/state";
import { ActiveGreenCard, ActiveJudgement, EngineCard } from "../types/cards";
import {
  CommandResult,
  DomainEvent,
  PlayerCommand,
} from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { TargetArea, TargetValidator } from "../combat/target_validator";
import { BangLimiter } from "../combat/bang_limiter";
import { EventEngine } from "../events/event_engine";
import { SeatManager } from "../board/seat_manager";
import { CardDefinition, CardRegistry } from "../cards/card_registry";
import { ArenaChainManager, ArenaEntryDraft } from "../arena/arena_chain_manager";
import { SkillHooks } from "./skill_hooks";
import { SkillTriggerBus } from "./skill_trigger_bus";
import { AtomicEffects } from "./primitives/atomic_effects";
import { AoePipeline } from "./pipeline/aoe_pipeline";
import { PendingReaction } from "./interact_types";
import { SingleTargetActions } from "./handlers/single_target";
import { AoeActions } from "./handlers/aoe_actions";
import { getAllEquippedCards, hasEquippedCardByName } from "../utils/inventory";

interface ExecutionPlan {
  card: EngineCard;
  def?: CardDefinition;
  originZone: ArenaOriginZone;
  cardIndex: number;
  greenIndex: number;
  greenEntry?: ActiveGreenCard;
  targetPlayer?: EnginePlayer;
  targetArea?: TargetArea;
  targetCardId?: string;
  extraCostCard?: EngineCard;
  sniperExtraCard?: EngineCard;
  isBangSubstitute: boolean;
  isRicochet: boolean;
  isEquip: boolean;
  isWeaponEquip: boolean;
  isBlueEquip: boolean;
  isGreenEquip: boolean;
  equipSlotKey?: EquipmentSlotKey;
  resolvedRicochetCardId?: string;
  isImmuneShortcut: boolean;
}

export class CardExecutionPipeline {
  // Execute phase 2 hand card play
  public static executeHandPlay(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const validated = this.validateHandPlay(state, player, card, cardIndex, command);
    if (!validated.ok) {
      return { success: false, message: validated.message };
    }
    const result = this.runLifecycle(state, player, validated.plan, command, deckManager);
    return this.clearForcedPlayIfMatched(player, card.id, result);
  }

  // Execute green card activation
  public static executeGreenActivation(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    const validated = this.validateGreenActivation(state, player, command);
    if (!validated.ok) {
      return { success: false, message: validated.message };
    }
    return this.runLifecycle(state, player, validated.plan, command, deckManager);
  }

  // Clear forced Law of the West card
  public static clearForcedPlayIfMatched(
    player: EnginePlayer,
    playedCardId: string | undefined,
    result: CommandResult
  ): CommandResult {
    if (result.success && playedCardId && player.forcedPlayCardId === playedCardId) {
      player.forcedPlayCardId = null;
    }
    return result;
  }

  // Run 7-step card lifecycle
  private static runLifecycle(
    state: SimulationState,
    player: EnginePlayer,
    plan: ExecutionPlan,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const events: DomainEvent[] = [];

    // Step 2: Consume source and cost cards
    const prevBangCount = state.bangCountThisTurn;
    this.consumeCards(state, player, plan, deckManager);

    // Step 3: Record arena chain entries
    this.recordArenaEntries(state, player, plan);

    // Step 4: Post-consume Suzy Lafayette check
    if (plan.originZone === "HAND") {
      SkillTriggerBus.onHandCardsConsumed(state, player, events, deckManager);
    }

    // Step 5: Single-target immunity shortcut
    if (plan.isImmuneShortcut && plan.targetPlayer) {
      events.push({
        type: "APACHE_KID_IMMUNITY",
        payload: {
          sourcePlayerId: player.id,
          targetPlayerId: plan.targetPlayer.id,
          card: plan.card,
        },
        timestamp: Date.now(),
      });
      if (plan.originZone === "GREEN") {
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetId: plan.targetPlayer.id,
            card: plan.card,
            evadedByImmunity: true,
          },
          timestamp: Date.now(),
        });
      }
      return { success: true, events };
    }

    // Step 6: Resolve effect or enqueue reaction
    const res = this.resolveEffect(state, player, plan, command, prevBangCount, deckManager);
    if (!res.success) {
      return res;
    }
    if (res.events && res.events.length > 0) {
      events.push(...res.events);
    }

    // Step 7: Finalize single event array
    return { success: true, events };
  }

  // Step 1A: Validate hand card play
  private static validateHandPlay(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    cardIndex: number,
    command: PlayerCommand
  ): { ok: true; plan: ExecutionPlan } | { ok: false; message: string } {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { ok: false, message: blockReason };
    }

    const isBangSubstitute =
      card.name === "MISSED!" && SkillHooks.canSubstituteCard(player, card, "BANG", state);
    const def = isBangSubstitute ? CardRegistry.get("BANG!") : CardRegistry.get(card);

    if (isBangSubstitute) {
      const bangBlock = EventEngine.shouldBlockPlayCard(state, player, {
        ...card,
        name: "BANG!",
      });
      if (bangBlock) {
        return { ok: false, message: bangBlock };
      }
    }

    if (def?.zone === "REACTION_ONLY" && !isBangSubstitute) {
      return {
        ok: false,
        message: `${card.name} can only be played as a reaction to an attack.`,
      };
    }

    const targetPlayer = command.targetPlayerId
      ? state.players.get(command.targetPlayerId)
      : undefined;

    const isWeaponEquip = def
      ? def.slotKey === "weapon"
      : card.category === "weapon" || (card.border === "blue" && Boolean(card.weaponRange));
    const isGreenEquip = def
      ? def.zone === "EQUIP_GREEN"
      : card.border === "green" ||
        card.category === "green_delayed" ||
        card.category === "green_delay" ||
        card.category === "green_active";
    const isBlueEquip = def ? def.zone === "EQUIP_BLUE" : card.border === "blue";
    const isEquip =
      isWeaponEquip ||
      isBlueEquip ||
      isGreenEquip ||
      def?.zone === "JUDGEMENT" ||
      card.category === "judgement" ||
      card.name === "JAIL" ||
      card.name === "DYNAMITE";

    if (isEquip) {
      const equipSlotKey = def?.slotKey ?? ArenaChainManager.resolveEquipmentSlotKey(card);
      if (isWeaponEquip) {
        if (player.equipments.weapon?.name === card.name) {
          return { ok: false, message: `You already have ${card.name} equipped.` };
        }
      } else if (card.name === "JAIL") {
        const val = TargetValidator.validate(state, card, player, targetPlayer, {
          requiresRange: false,
        });
        if (!val.valid) {
          return { ok: false, message: val.reason ?? "Invalid target for Jail." };
        }
      } else if (card.name === "DYNAMITE") {
        if (
          player.judgements.some(
            (j) => j.type === "DYNAMITE" || j.card.name === card.name
          )
        ) {
          return { ok: false, message: "You already have Dynamite in play." };
        }
      } else if (isBlueEquip) {
        if (equipSlotKey === "horseDef" && player.equipments.horseDef) {
          return { ok: false, message: "You already have Mustang equipped." };
        }
        if (equipSlotKey === "horseOff" && player.equipments.horseOff) {
          return { ok: false, message: "You already have Scope equipped." };
        }
        if (equipSlotKey === "barrel" && player.equipments.barrel) {
          return { ok: false, message: "You already have Barrel equipped." };
        }
        if (
          equipSlotKey !== "horseDef" &&
          equipSlotKey !== "horseOff" &&
          equipSlotKey !== "barrel" &&
          hasEquippedCardByName(player, card.name)
        ) {
          return { ok: false, message: `You already have ${card.name} equipped.` };
        }
      } else if (isGreenEquip) {
        if (player.greenCards.some((g) => g.card.name === card.name)) {
          return { ok: false, message: `You already have ${card.name} in play.` };
        }
      }

      const isImmuneShortcut =
        card.name === "JAIL" &&
        Boolean(targetPlayer && SkillHooks.isImmuneToCard(targetPlayer, card, player, state));

      return {
        ok: true,
        plan: {
          card,
          def,
          originZone: "HAND",
          cardIndex,
          greenIndex: -1,
          targetPlayer,
          isBangSubstitute: false,
          isRicochet: false,
          isEquip: true,
          isWeaponEquip,
          isBlueEquip,
          isGreenEquip,
          equipSlotKey,
          isImmuneShortcut,
        },
      };
    }

    if (!def) {
      return { ok: false, message: `Unsupported action card: ${card.name}` };
    }

    const code = state.activeEvent?.effectCode;
    const isBangCard = card.name === "BANG!" || isBangSubstitute;
    const isRicochet =
      isBangCard &&
      code === "EVENT_FOC_RICOCHET" &&
      Boolean(command.targetArea && command.targetArea !== "HAND");

    let resolvedRicochetCardId: string | undefined;
    let sniperExtraCard: EngineCard | undefined;

    if (isBangCard) {
      if (!targetPlayer) {
        return { ok: false, message: "Target required for BANG!." };
      }
      if (isRicochet && command.targetArea) {
        if (
          command.targetArea !== "EQUIPMENT" &&
          command.targetArea !== "GREEN" &&
          command.targetArea !== "JUDGEMENT"
        ) {
          return { ok: false, message: "Ricochet targets cards in play only." };
        }
        const validation = TargetValidator.validate(state, card, player, targetPlayer, {
          targetArea: command.targetArea,
          targetCardId: command.targetCardId,
          requiresRange: false,
        });
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
        resolvedRicochetCardId = SingleTargetActions.resolveRicochetTargetCardId(
          targetPlayer,
          command.targetArea,
          command.targetCardId
        );
        if (!resolvedRicochetCardId) {
          return { ok: false, message: "Target card not found in play." };
        }
      } else {
        if (
          code === "EVENT_FOC_SNIPER" &&
          command.discardCardIds &&
          command.discardCardIds.length > 0
        ) {
          const extraId = command.discardCardIds[0];
          const candidate =
            extraId !== card.id
              ? player.handCards.find((c) => c.id === extraId)
              : undefined;
          const isBangLike =
            candidate &&
            (candidate.name === "BANG!" ||
              (candidate.name === "MISSED!" &&
                SkillHooks.hasSkill(player, "Calamity Janet", state)));
          if (!isBangLike) {
            return {
              ok: false,
              message: "Sniper requires discarding a second BANG! card.",
            };
          }
          sniperExtraCard = candidate;
        }
        if (!sniperExtraCard && !BangLimiter.canPlayBang(state, player)) {
          return {
            ok: false,
            message: "You have already reached the BANG! limit this turn.",
          };
        }
        const validation = TargetValidator.validate(state, card, player, targetPlayer, {
          requiresRange: true,
        });
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
      }
    }

    // Parameterized extra hand discard validation
    let extraCostCard: EngineCard | undefined;
    if (def.extraHandDiscard > 0) {
      const extraRes = this.validateExtraDiscard(
        player,
        card,
        command.discardCardIds?.[0]
      );
      if (!extraRes.ok) {
        return extraRes;
      }
      extraCostCard = extraRes.extraCard;
    }

    let resolvedTarget = targetPlayer;
    let targetArea: TargetArea | undefined;
    let targetCardId: string | undefined;

    if (card.name === "TEQUILA") {
      resolvedTarget = targetPlayer ?? player;
      if (resolvedTarget.isDead || resolvedTarget.isGhost) {
        return { ok: false, message: "Target player cannot regain life points." };
      }
    } else if (!isBangCard && def.targeting.scope === "SINGLE_OTHER") {
      if (!targetPlayer) {
        return { ok: false, message: `Target required for ${card.name}.` };
      }
      if (CardRegistry.isManipulationCard(card)) {
        targetArea = command.targetArea || "HAND";
        targetCardId = command.targetCardId;
        const validation = TargetValidator.validate(state, card, player, targetPlayer, {
          targetArea,
          targetCardId,
          exactDistance: def.targeting.distance === "EXACT_1" ? 1 : undefined,
          requiresRange: def.targeting.distance === "EXACT_1" ? undefined : false,
        });
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
        if (!this.hasTargetCard(targetPlayer, targetArea, targetCardId)) {
          return {
            ok: false,
            message: `Target card not found in ${targetArea.toLowerCase()}.`,
          };
        }
      } else {
        const valOpts =
          def.targeting.distance === "EXACT_1"
            ? { exactDistance: 1 }
            : { requiresRange: false };
        const validation = TargetValidator.validate(
          state,
          card,
          player,
          targetPlayer,
          valOpts
        );
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
      }
    }

    const usesImmunityShortcut =
      def.checkApacheKid &&
      !def.combat.reactionType &&
      def.targeting.scope !== "ALL_OTHERS" &&
      def.targeting.scope !== "ALL_LIVING" &&
      Boolean(resolvedTarget && resolvedTarget.id !== player.id) &&
      SkillHooks.isImmuneToCard(resolvedTarget!, card, player, state);

    return {
      ok: true,
      plan: {
        card,
        def,
        originZone: "HAND",
        cardIndex,
        greenIndex: -1,
        targetPlayer: resolvedTarget,
        targetArea: isRicochet ? command.targetArea : targetArea,
        targetCardId: isRicochet ? command.targetCardId : targetCardId,
        extraCostCard,
        sniperExtraCard,
        isBangSubstitute,
        isRicochet,
        isEquip: false,
        isWeaponEquip: false,
        isBlueEquip: false,
        isGreenEquip: false,
        resolvedRicochetCardId,
        isImmuneShortcut: usesImmunityShortcut,
      },
    };
  }

  // Step 1B: Validate green card activation
  private static validateGreenActivation(
    state: SimulationState,
    player: EnginePlayer,
    command: PlayerCommand
  ): { ok: true; plan: ExecutionPlan } | { ok: false; message: string } {
    const requestedGreenId = command.greenCardId ?? command.cardId;
    if (!requestedGreenId) {
      return { ok: false, message: "Green card ID is required." };
    }

    const greenCards = player.greenCards || [];
    const greenIndex = greenCards.findIndex(
      (g) => g.id === requestedGreenId || g.card.id === requestedGreenId
    );
    if (greenIndex === -1) {
      return { ok: false, message: "Green card not found in play." };
    }

    const greenEntry = greenCards[greenIndex];
    const card = greenEntry.card;
    const def = CardRegistry.get(card);

    if (CardRegistry.isGreenDefenseCard(card)) {
      return {
        ok: false,
        message: `${card.name} can only be activated during an attack reaction.`,
      };
    }
    if (!CardRegistry.isGreenActiveCard(card) || !def) {
      return { ok: false, message: `Unsupported green card: ${card.name}` };
    }
    if (greenEntry.isDelay) {
      return {
        ok: false,
        message: "Green card cannot be activated on the turn it was played.",
      };
    }

    const turnPlayer = state.players.get(state.turnPlayerId);
    if (!SkillHooks.isEquipmentEffective(player, turnPlayer ?? player, state)) {
      return {
        ok: false,
        message: "Green card abilities are currently negated.",
      };
    }

    if (card.name === "CANTEEN") {
      if (player.isGhost) {
        return { ok: false, message: "Ghosts cannot regain life points." };
      }
      if (player.hp >= player.maxHp) {
        return { ok: false, message: "Already at maximum HP." };
      }
    }

    const targetPlayer = command.targetPlayerId
      ? state.players.get(command.targetPlayerId)
      : undefined;
    let targetArea: TargetArea | undefined;
    let targetCardId: string | undefined;

    if (def.targeting.scope === "SINGLE_OTHER") {
      if (!targetPlayer) {
        return { ok: false, message: `Target required for ${card.name}.` };
      }
      if (CardRegistry.isManipulationCard(card)) {
        targetArea = command.targetArea || "HAND";
        targetCardId = command.targetCardId;
        const validation = TargetValidator.validate(state, card, player, targetPlayer, {
          targetArea,
          targetCardId,
          requiresRange: false,
        });
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
        if (!this.hasTargetCard(targetPlayer, targetArea, targetCardId)) {
          return {
            ok: false,
            message: `Target card not found in ${targetArea.toLowerCase()}.`,
          };
        }
      } else {
        const valOpts =
          def.targeting.distance === "WEAPON_RANGE"
            ? { requiresRange: true }
            : def.targeting.distance === "EXACT_1"
            ? { exactDistance: 1 }
            : { requiresRange: false };
        const validation = TargetValidator.validate(
          state,
          card,
          player,
          targetPlayer,
          valOpts
        );
        if (!validation.valid) {
          return { ok: false, message: validation.reason ?? "Invalid target." };
        }
      }
    }

    const usesImmunityShortcut =
      def.checkApacheKid &&
      !def.combat.reactionType &&
      def.targeting.scope === "SINGLE_OTHER" &&
      Boolean(targetPlayer && SkillHooks.isImmuneToCard(targetPlayer, card, player, state));

    return {
      ok: true,
      plan: {
        card,
        def,
        originZone: "GREEN",
        cardIndex: -1,
        greenIndex,
        greenEntry,
        targetPlayer,
        targetArea,
        targetCardId,
        isBangSubstitute: false,
        isRicochet: false,
        isEquip: false,
        isWeaponEquip: false,
        isBlueEquip: false,
        isGreenEquip: false,
        isImmuneShortcut: usesImmunityShortcut,
      },
    };
  }

  // Validate extra hand discard cost
  private static validateExtraDiscard(
    player: EnginePlayer,
    card: EngineCard,
    extraCardId: string | undefined
  ): { ok: true; extraCard: EngineCard } | { ok: false; message: string } {
    if (!extraCardId || extraCardId === card.id) {
      return {
        ok: false,
        message: `${card.name} requires discarding 1 extra card.`,
      };
    }
    const extraCard = player.handCards.find((c) => c.id === extraCardId);
    if (!extraCard) {
      return { ok: false, message: "Valid extra card required." };
    }
    return { ok: true, extraCard };
  }

  // Check target area card presence
  private static hasTargetCard(
    targetPlayer: EnginePlayer,
    targetArea: TargetArea,
    targetCardId?: string
  ): boolean {
    if (targetArea === "HAND") return targetPlayer.handCards.length > 0;
    if (!targetCardId) return false;
    if (targetArea === "EQUIPMENT") {
      return getAllEquippedCards(targetPlayer).some((c) => c.id === targetCardId);
    }
    if (targetArea === "GREEN") {
      return (targetPlayer.greenCards || []).some(
        (g) => g.id === targetCardId || g.card.id === targetCardId
      );
    }
    if (targetArea === "JUDGEMENT") {
      return (targetPlayer.judgements || []).some(
        (j) => j.id === targetCardId || j.card.id === targetCardId
      );
    }
    return false;
  }

  // Step 2: Consume played and cost cards
  private static consumeCards(
    state: SimulationState,
    player: EnginePlayer,
    plan: ExecutionPlan,
    deckManager?: DeckManager
  ): void {
    if (plan.originZone === "GREEN") {
      const removedGreen = (player.greenCards || []).splice(plan.greenIndex, 1)[0];
      if (removedGreen) {
        AtomicEffects.discardCard(state, removedGreen.card, deckManager);
      }
      return;
    }

    const idsToRemove = [plan.card.id];
    if (plan.extraCostCard) idsToRemove.push(plan.extraCostCard.id);
    if (plan.sniperExtraCard) idsToRemove.push(plan.sniperExtraCard.id);

    const idSet = new Set(idsToRemove);
    const removed: EngineCard[] = [];
    player.handCards = player.handCards.filter((c) => {
      if (idSet.has(c.id)) {
        removed.push(c);
        return false;
      }
      return true;
    });

    if (plan.isEquip) {
      if (plan.isWeaponEquip && player.equipments.weapon) {
        AtomicEffects.discardCard(state, player.equipments.weapon, deckManager);
      } else if (plan.isImmuneShortcut) {
        AtomicEffects.discardCards(state, removed, deckManager);
      }
    } else {
      AtomicEffects.discardCards(state, removed, deckManager);
    }

    if (
      (plan.card.name === "BANG!" || plan.isBangSubstitute) &&
      !plan.isRicochet &&
      !plan.sniperExtraCard
    ) {
      state.bangCountThisTurn += 1;
    }
  }

  // Step 3: Append arena chain entries
  private static recordArenaEntries(
    state: SimulationState,
    player: EnginePlayer,
    plan: ExecutionPlan
  ): void {
    const { card, def, targetPlayer } = plan;

    if (plan.isEquip) {
      if (plan.isWeaponEquip) {
        ArenaChainManager.appendBatch(state, [
          {
            kind: "EQUIP_PLACEMENT",
            card,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: "HAND",
            destinationZone: "EQUIPMENT",
            destinationPlayerId: player.id,
            destinationSlotKey: "weapon",
            actionLabel: `Equip ${card.name}`,
          },
        ]);
      } else if (card.name === "JAIL" && targetPlayer) {
        if (plan.isImmuneShortcut) {
          ArenaChainManager.appendBatch(state, [
            {
              kind: "PLAYED_CARD",
              card,
              actorPlayerId: player.id,
              actorPlayerName: player.name,
              targetPlayerId: targetPlayer.id,
              targetPlayerName: targetPlayer.name,
              originZone: "HAND",
              destinationZone: "DISCARD",
              actionLabel: `${card.name} -> ${targetPlayer.name} (Immune)`,
            },
          ]);
        } else {
          ArenaChainManager.appendBatch(state, [
            {
              kind: "EQUIP_PLACEMENT",
              card,
              actorPlayerId: player.id,
              actorPlayerName: player.name,
              targetPlayerId: targetPlayer.id,
              targetPlayerName: targetPlayer.name,
              originZone: "HAND",
              destinationZone: "JUDGEMENT",
              destinationPlayerId: targetPlayer.id,
              actionLabel: `${card.name} -> ${targetPlayer.name}`,
              vfxType: "jail",
              vfxTargetId: targetPlayer.id,
            },
          ]);
        }
      } else if (card.name === "DYNAMITE") {
        ArenaChainManager.appendBatch(state, [
          {
            kind: "EQUIP_PLACEMENT",
            card,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: "HAND",
            destinationZone: "JUDGEMENT",
            destinationPlayerId: player.id,
            actionLabel: `Place ${card.name}`,
            vfxType: "dynamite",
            vfxTargetId: player.id,
          },
        ]);
      } else if (plan.isBlueEquip) {
        ArenaChainManager.appendBatch(state, [
          {
            kind: "EQUIP_PLACEMENT",
            card,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: "HAND",
            destinationZone: "EQUIPMENT",
            destinationPlayerId: player.id,
            destinationSlotKey: plan.equipSlotKey ?? ArenaChainManager.resolveEquipmentSlotKey(card),
            actionLabel: `Equip ${card.name}`,
          },
        ]);
      } else {
        ArenaChainManager.appendBatch(state, [
          {
            kind: "EQUIP_PLACEMENT",
            card,
            actorPlayerId: player.id,
            actorPlayerName: player.name,
            originZone: "HAND",
            destinationZone: "GREEN",
            destinationPlayerId: player.id,
            actionLabel: `Place ${card.name}`,
          },
        ]);
      }
      return;
    }

    let actionLabel = targetPlayer ? `${card.name} -> ${targetPlayer.name}` : card.name;
    let vfxType: ArenaVfxType | undefined;
    let vfxTargetId: string | undefined;
    let vfxAoe: boolean | undefined;

    if (plan.isRicochet && targetPlayer) {
      actionLabel = `Ricochet ${card.name} -> ${targetPlayer.name}`;
      vfxType = "bullet";
      vfxTargetId = targetPlayer.id;
    } else if (def?.drawOnPlay && !def.combat.reactionType) {
      actionLabel = `${card.name} (+${def.drawOnPlay})`;
      vfxType = "draw";
    } else if (card.name === "BEER") {
      const livingCount = SeatManager.getLivingContenders(state).length;
      actionLabel = livingCount <= 2 ? `${card.name} (No Effect)` : `${card.name} (+HP)`;
      vfxType = livingCount > 2 ? "heal" : undefined;
      vfxTargetId = player.id;
    } else if (card.name === "SALOON") {
      actionLabel = `${card.name} (+1 HP All)`;
      vfxType = "heal";
      vfxAoe = true;
    } else if (card.name === "WHISKY") {
      actionLabel = `${card.name} (+2 HP)`;
      vfxType = "heal";
      vfxTargetId = player.id;
    } else if (card.name === "CANTEEN") {
      actionLabel = `${card.name} (+1 HP)`;
      vfxType = "heal";
      vfxTargetId = player.id;
    } else if (card.name === "TEQUILA" && targetPlayer) {
      vfxType = plan.isImmuneShortcut ? undefined : "heal";
      vfxTargetId = targetPlayer.id;
    } else if (card.name === "DUEL" && targetPlayer) {
      vfxType = "bullet";
      vfxTargetId = targetPlayer.id;
    } else if (def?.combat.reactionType) {
      vfxType = "bullet";
      if (def.targeting.scope === "ALL_OTHERS") {
        vfxAoe = true;
      } else if (targetPlayer) {
        vfxTargetId = targetPlayer.id;
      }
    }

    const drafts: ArenaEntryDraft[] = [
      {
        kind: "PLAYED_CARD",
        card,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        targetPlayerId: targetPlayer?.id,
        targetPlayerName: targetPlayer?.name,
        originZone: plan.originZone,
        destinationZone: "DISCARD",
        actionLabel,
        vfxType,
        vfxTargetId,
        vfxAoe,
      },
    ];

    if (plan.extraCostCard) {
      drafts.push({
        kind: "EXTRA_COST",
        card: plan.extraCostCard,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: `Discard Cost (${plan.extraCostCard.name})`,
      });
    }

    if (plan.sniperExtraCard && targetPlayer) {
      drafts.push({
        kind: "EXTRA_COST",
        card: plan.sniperExtraCard,
        actorPlayerId: player.id,
        actorPlayerName: player.name,
        targetPlayerId: targetPlayer.id,
        targetPlayerName: targetPlayer.name,
        originZone: "HAND",
        destinationZone: "DISCARD",
        actionLabel: `Sniper Cost (${plan.sniperExtraCard.name})`,
      });
    }

    ArenaChainManager.appendBatch(state, drafts);
  }

  // Step 6: Execute resolved card effect
  private static resolveEffect(
    state: SimulationState,
    player: EnginePlayer,
    plan: ExecutionPlan,
    command: PlayerCommand,
    prevBangCount: number,
    deckManager?: DeckManager
  ): CommandResult {
    const { card, def, targetPlayer } = plan;
    const events: DomainEvent[] = [];

    if (plan.isEquip) {
      return this.resolveEquipPlacement(state, player, plan);
    }

    if (!def) {
      return { success: false, message: `Unsupported card: ${card.name}` };
    }

    // Draw-only cards: Stagecoach, Wells Fargo, Pony Express
    if (def.drawOnPlay && !def.combat.reactionType) {
      const { cards: drawn, events: drawEvents } = AtomicEffects.drawCards(
        state,
        def.drawOnPlay,
        deckManager
      );
      player.handCards.push(...drawn);
      events.push(...drawEvents);
      if (plan.originZone === "HAND" || drawn.length > 0) {
        events.push({
          type: "CARDS_DRAWN",
          visibleTo: [player.id],
          payload: {
            playerId: player.id,
            playerName: player.name,
            sourceCard: card,
            count: drawn.length,
            cards: drawn,
          },
          maskedPayload: {
            playerId: player.id,
            playerName: player.name,
            sourceCard: card,
            count: drawn.length,
          },
          timestamp: Date.now(),
        });
      }
      if (plan.originZone === "GREEN") {
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            card,
            drawnCount: drawn.length,
          },
          timestamp: Date.now(),
        });
      }
      return { success: true, events };
    }

    // Heals: Beer, Saloon, Whisky, Tequila, Canteen
    if (def.healAmount) {
      if (card.name === "BEER") {
        const living = SeatManager.getLivingContenders(state);
        if (living.length <= 2) {
          events.push({
            type: "BEER_NO_EFFECT_2P",
            payload: {
              playerId: player.id,
              card,
              message: "Beer has no effect when only 2 players remain.",
            },
            timestamp: Date.now(),
          });
          return { success: true, events };
        }
        const beerHeal = SkillHooks.getBeerHealAmount(player, state);
        if (beerHeal > 1 && SkillHooks.hasSkill(player, "Tequila Joe", state)) {
          events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              skill: "Tequila Joe",
              detail: `healed +${beerHeal} HP from Beer`,
            },
            timestamp: Date.now(),
          });
        }
        AtomicEffects.applyHeal(state, player, 1, card, events, deckManager);
        return { success: true, events };
      }

      if (card.name === "SALOON") {
        const res = AoePipeline.executeInstantAoe(
          state,
          player,
          card,
          "ALL_PLAYERS",
          (target) => {
            const stepEvents: DomainEvent[] = [];
            if (SkillHooks.isImmuneToCard(target, card, player, state)) {
              stepEvents.push({
                type: "APACHE_KID_IMMUNITY",
                payload: {
                  sourcePlayerId: player.id,
                  targetPlayerId: target.id,
                  playerId: target.id,
                  card,
                },
                timestamp: Date.now(),
              });
              return stepEvents;
            }
            AtomicEffects.applyHeal(state, target, 1, card, stepEvents, deckManager);
            return stepEvents;
          }
        );
        return {
          success: res.success,
          message: res.message,
          events: [
            ...(res.events || []),
            {
              type: "SALOON_HEALED",
              payload: { sourcePlayerId: player.id, card },
              timestamp: Date.now(),
            },
          ],
        };
      }

      const healTarget = card.name === "TEQUILA" ? targetPlayer ?? player : player;
      AtomicEffects.applyHeal(
        state,
        healTarget,
        def.healAmount,
        card,
        events,
        deckManager
      );
      if (plan.originZone === "GREEN") {
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            card,
            currentHp: player.hp,
          },
          timestamp: Date.now(),
        });
      }
      return { success: true, events };
    }

    // General Store draft
    if (card.name === "GENERAL STORE") {
      return AoePipeline.executeDraftStoreAoe(state, player, card, deckManager);
    }

    // Brawl AOE destruction
    if (card.name === "BRAWL") {
      return this.resolveBrawlEffect(state, player, card, command, deckManager);
    }

    // Steal or destroy manipulation
    if (def.manipulation && targetPlayer && plan.targetArea) {
      const isSteal = def.manipulation === "STEAL";
      const transferred = isSteal
        ? AtomicEffects.stealCard(
            state,
            player,
            targetPlayer,
            plan.targetArea,
            plan.targetCardId,
            events,
            deckManager
          )
        : AtomicEffects.destroyCard(
            state,
            player,
            targetPlayer,
            plan.targetArea,
            plan.targetCardId,
            events,
            deckManager
          );
      if (!transferred) {
        return { success: false, message: "Target card not found." };
      }
      if (plan.originZone === "GREEN") {
        const hideTransferred = isSteal && plan.targetArea === "HAND";
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetId: targetPlayer.id,
            card,
            ...(hideTransferred ? {} : { transferredCard: transferred }),
          },
          timestamp: Date.now(),
        });
      }
      return { success: true, events };
    }

    // Duel reaction setup
    if (card.name === "DUEL" && targetPlayer) {
      const reaction: PendingReaction = {
        id: `reaction_duel_${targetPlayer.id}_${Date.now()}`,
        type: "DUEL_RESPONSE",
        sourcePlayerId: player.id,
        duelInitiatorId: player.id,
        targetPlayerId: targetPlayer.id,
        sourceCard: card,
        requiredCard: "BANG",
        requiredCount: 1,
        currentCount: 0,
        canUseBarrel: false,
        canUseJourdonnais: false,
        barrelChecked: false,
        jourdonnaisChecked: false,
        createdAt: Date.now(),
      };
      state.pendingReactions.push(reaction);
      events.push({
        type: "DUEL_STARTED",
        payload: {
          initiatorId: player.id,
          initiatorName: player.name,
          targetId: targetPlayer.id,
          targetName: targetPlayer.name,
          card,
          nextResponderId: targetPlayer.id,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    // AOE reaction attacks: Indians!, Gatling, Howitzer
    if (def.targeting.scope === "ALL_OTHERS" && def.combat.reactionType) {
      const reactionType = def.combat.reactionType;
      const requiredCard = reactionType === "INDIANS_DEFENSE" ? "BANG" : "MISSED";
      const allowBarrel = Boolean(def.combat.allowBarrel);
      const allowJourdonnais = Boolean(def.combat.allowJourdonnais);

      const res = AoePipeline.executeReactionAoe(
        state,
        player,
        card,
        "ALL_OTHERS",
        () => ({
          type: reactionType,
          requiredCard,
          requiredCount: 1,
          allowBarrel,
          allowJourdonnais,
        })
      );
      if (plan.originZone === "GREEN") {
        return {
          success: res.success,
          message: res.message,
          events: [
            {
              type: "GREEN_CARD_ACTIVATED",
              payload: {
                playerId: player.id,
                playerName: player.name,
                card,
              },
              timestamp: Date.now(),
            },
            ...(res.events || []),
          ],
        };
      }
      return res;
    }

    // Ricochet attack on in-play card
    if (plan.isRicochet && targetPlayer && plan.targetArea && plan.resolvedRicochetCardId) {
      const reactionRes = AtomicEffects.createReaction(
        state,
        targetPlayer,
        player,
        card,
        {
          type: "EVENT_RICOCHET_DEFENSE",
          requiredCard: "MISSED",
          requiredCount: 1,
          allowBarrel: false,
          allowJourdonnais: false,
        },
        {
          ricochetTargetArea: plan.targetArea as "EQUIPMENT" | "GREEN" | "JUDGEMENT",
          ricochetTargetCardId: plan.resolvedRicochetCardId,
        }
      );
      events.push(...reactionRes.events);
      if (!reactionRes.isImmune && reactionRes.reaction) {
        events.push({
          type: "RICOCHET_SHOT_LAUNCHED",
          payload: {
            attackerId: player.id,
            attackerName: player.name,
            targetId: targetPlayer.id,
            targetName: targetPlayer.name,
            targetArea: plan.targetArea,
            targetCardId: plan.resolvedRicochetCardId,
            card,
          },
          timestamp: Date.now(),
        });
      }
      return { success: true, events };
    }

    // Single-target attack reactions
    if (def.combat.reactionType && targetPlayer) {
      if (plan.originZone === "GREEN" && def.drawOnPlay) {
        const { cards: drawn, events: drawEvents } = AtomicEffects.drawCards(
          state,
          def.drawOnPlay,
          deckManager
        );
        player.handCards.push(...drawn);
        events.push(...drawEvents);
        if (drawn.length > 0) {
          events.push({
            type: "CARDS_DRAWN",
            visibleTo: [player.id],
            payload: {
              playerId: player.id,
              playerName: player.name,
              sourceCard: card,
              count: drawn.length,
              cards: drawn,
            },
            maskedPayload: {
              playerId: player.id,
              playerName: player.name,
              sourceCard: card,
              count: drawn.length,
            },
            timestamp: Date.now(),
          });
        }
      }

      const reactionRes = AtomicEffects.createReaction(state, targetPlayer, player, card, {
        type: def.combat.reactionType,
        requiredCard: "MISSED",
        requiredCount: plan.sniperExtraCard
          ? 2
          : card.name === "BANG!" || plan.isBangSubstitute
          ? undefined
          : 1,
        allowBarrel: Boolean(def.combat.allowBarrel),
        allowJourdonnais: Boolean(def.combat.allowJourdonnais),
      });
      events.push(...reactionRes.events);

      if (card.name === "BANG!" || plan.isBangSubstitute) {
        if (plan.isBangSubstitute) {
          events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              skill: "Calamity Janet",
              detail: "played MISSED! as BANG!",
            },
            timestamp: Date.now(),
          });
        }
        if (
          prevBangCount >= 1 &&
          player.equipments.weapon?.name !== "VOLCANIC" &&
          SkillHooks.hasSkill(player, "Willy the Kid", state)
        ) {
          events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              skill: "Willy the Kid",
              detail: "unlimited BANG! per turn",
            },
            timestamp: Date.now(),
          });
        }
        if (
          !reactionRes.isImmune &&
          reactionRes.reaction &&
          reactionRes.reaction.requiredCount >= 2 &&
          !plan.sniperExtraCard &&
          SkillHooks.hasSkill(player, "Slab the Killer", state)
        ) {
          events.push({
            type: "ACTIVE_SKILL_USED",
            payload: {
              playerId: player.id,
              playerName: player.name,
              skill: "Slab the Killer",
              detail: "requires 2 Missed! to evade",
            },
            timestamp: Date.now(),
          });
        }
        if (!reactionRes.isImmune && reactionRes.reaction) {
          events.push({
            type: "BANG_ATTACK_LAUNCHED",
            payload: {
              attackerId: player.id,
              attackerName: player.name,
              targetId: targetPlayer.id,
              targetName: targetPlayer.name,
              card,
              isSniper: Boolean(plan.sniperExtraCard),
              requiredMissedCount: reactionRes.reaction.requiredCount,
              canUseBarrel: reactionRes.reaction.canUseBarrel,
              canUseJourdonnais: reactionRes.reaction.canUseJourdonnais,
            },
            timestamp: Date.now(),
          });
        }
      } else if (card.name === "PUNCH") {
        if (!reactionRes.isImmune && reactionRes.reaction) {
          events.push({
            type: "PUNCH_LAUNCHED",
            payload: { attackerId: player.id, targetId: targetPlayer.id, card },
            timestamp: Date.now(),
          });
        }
      } else if (card.name === "SPRINGFIELD") {
        if (!reactionRes.isImmune && reactionRes.reaction) {
          events.push({
            type: "SPRINGFIELD_LAUNCHED",
            payload: {
              attackerId: player.id,
              targetId: targetPlayer.id,
              card,
              extraCard: plan.extraCostCard,
            },
            timestamp: Date.now(),
          });
        }
      } else if (plan.originZone === "GREEN") {
        events.push({
          type: "GREEN_CARD_ACTIVATED",
          payload: {
            playerId: player.id,
            playerName: player.name,
            targetId: targetPlayer.id,
            card,
            evadedByImmunity: reactionRes.isImmune,
          },
          timestamp: Date.now(),
        });
      }

      return { success: true, events };
    }

    return { success: false, message: `Unsupported card execution: ${card.name}` };
  }

  // Place equipment, judgement, or green card
  private static resolveEquipPlacement(
    state: SimulationState,
    player: EnginePlayer,
    plan: ExecutionPlan
  ): CommandResult {
    const { card, targetPlayer } = plan;
    const events: DomainEvent[] = [];

    if (plan.isWeaponEquip) {
      player.equipments.weapon = card;
      events.push({
        type: "EQUIPMENT_EQUIPPED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          slot: "weapon",
          card,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    if (card.name === "JAIL" && targetPlayer) {
      state.attachedSeqCounter += 1;
      const newJail: ActiveJudgement = {
        id: `jail_${Date.now()}_${card.id}`,
        card,
        type: "JAIL",
        attachedSeq: state.attachedSeqCounter,
        attachedTimestamp: Date.now(),
      };
      targetPlayer.judgements.push(newJail);
      events.push({
        type: "JAIL_ATTACHED",
        payload: {
          sourcePlayerId: player.id,
          targetPlayerId: targetPlayer.id,
          seq: state.attachedSeqCounter,
          card,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    if (card.name === "DYNAMITE") {
      state.attachedSeqCounter += 1;
      const newDynamite: ActiveJudgement = {
        id: `dynamite_${Date.now()}_${card.id}`,
        card,
        type: "DYNAMITE",
        attachedSeq: state.attachedSeqCounter,
        attachedTimestamp: Date.now(),
      };
      player.judgements.push(newDynamite);
      events.push({
        type: "DYNAMITE_ATTACHED",
        payload: {
          playerId: player.id,
          seq: state.attachedSeqCounter,
          card,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    if (plan.isBlueEquip) {
      const slotKey = plan.equipSlotKey ?? ArenaChainManager.resolveEquipmentSlotKey(card);
      if (slotKey === "horseDef") {
        player.equipments.horseDef = card;
      } else if (slotKey === "horseOff") {
        player.equipments.horseOff = card;
      } else if (slotKey === "barrel") {
        player.equipments.barrel = card;
      } else {
        const extras = player.equipments.extras ? [...player.equipments.extras] : [];
        if (
          player.equipments.extra &&
          !extras.some((e) => e.id === player.equipments.extra!.id)
        ) {
          extras.unshift(player.equipments.extra);
        }
        extras.push(card);
        player.equipments.extras = extras;
        player.equipments.extra = extras[0];
      }
      events.push({
        type: "EQUIPMENT_EQUIPPED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card,
        },
        timestamp: Date.now(),
      });
      return { success: true, events };
    }

    const greenCard: ActiveGreenCard = {
      id: `green_${Date.now()}_${card.id}`,
      card,
      isDelay: true,
      attachedTurnRound: state.roundNumber,
    };
    player.greenCards.push(greenCard);
    events.push({
      type: "GREEN_CARD_EQUIPPED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        card,
      },
      timestamp: Date.now(),
    });
    return { success: true, events };
  }

  // Resolve Brawl multi-target card destruction
  private static resolveBrawlEffect(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    return AoeActions.resolveBrawlTargets(state, player, card, command, deckManager);
  }
}
