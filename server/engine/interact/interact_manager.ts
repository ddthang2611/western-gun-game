import { SimulationState, EnginePlayer } from "../types/state";
import { EngineCard } from "../types/cards";
import { PlayerCommand, CommandResult, DomainEvent } from "../types/actions";
import { DeckManager } from "../deck/deck_manager";
import { TargetValidator } from "../combat/target_validator";
import { BangLimiter } from "../combat/bang_limiter";
import { EventEngine } from "../events/event_engine";
import { DraftStore } from "./handlers/draft_store";
import { ActiveSkills } from "./handlers/active_skills";
import { ReactionResolver } from "./reaction_resolver";
import { SkillHooks } from "./skill_hooks";
import { CardRegistry } from "../cards/card_registry";
import { CardExecutionPipeline } from "./card_execution_pipeline";
import { getAllEquippedCards, hasEquippedCardByName } from "../utils/inventory";

export class InteractManager {
  // Route card play command
  public static resolveCardPlay(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    if (command.greenCardId) {
      return this.resolveActivateGreenCard(state, command, deckManager);
    }

    if (!command.cardId) {
      return { success: false, message: "Card ID is required." };
    }

    const cardIndex = player.handCards.findIndex((c) => c.id === command.cardId);
    if (cardIndex === -1) {
      const greenMatch = (player.greenCards || []).find(
        (g) => g.id === command.cardId || g.card.id === command.cardId
      );
      if (greenMatch) {
        return this.resolveActivateGreenCard(
          state,
          { ...command, greenCardId: greenMatch.id },
          deckManager
        );
      }
      return { success: false, message: "Card not in hand." };
    }

    const card = player.handCards[cardIndex];
    return CardExecutionPipeline.executeHandPlay(
      state,
      player,
      card,
      cardIndex,
      command,
      deckManager
    );
  }

  // Activate ready green card
  public static resolveActivateGreenCard(
    state: SimulationState,
    command: PlayerCommand,
    eventsOrDeckManager?: DomainEvent[] | DeckManager,
    maybeDeckManager?: DeckManager
  ): CommandResult {
    const deckManager = Array.isArray(eventsOrDeckManager)
      ? maybeDeckManager
      : eventsOrDeckManager;
    return CardExecutionPipeline.executeGreenActivation(state, command, deckManager);
  }

  // Route reaction command
  public static resolveReaction(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    return ReactionResolver.resolve(state, command, deckManager);
  }

  // Route active chain card selection
  public static resolveDraftSelection(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    const head = state.activeChain?.[0];
    if (head && head.type === "BRAWL_CARD_PICK") {
      return DraftStore.handleBrawlSelect(state, player, command, deckManager);
    }
    if (head && head.type === "LUCKY_DUKE_PICK") {
      return DraftStore.handleLuckyDukeSelect(state, player, command, deckManager);
    }
    if (head && head.type === "EL_GRINGO_PICK") {
      return DraftStore.handleElGringoSelect(state, player);
    }
    if (!command.cardId) {
      return { success: false, message: "Card ID required to pick." };
    }
    return DraftStore.handleDraftSelect(state, player, command.cardId, deckManager);
  }

  // Prune dead or stale reactions
  public static pruneStaleReactions(state: SimulationState): void {
    ReactionResolver.pruneStaleReactions(state);
  }

  // Route character active skill
  public static executeActiveSkill(
    state: SimulationState,
    command: PlayerCommand,
    deckManager?: DeckManager
  ): CommandResult {
    const player = state.players.get(command.playerId);
    if (!player) return { success: false, message: "Player not found." };
    if (player.isDead) return { success: false, message: "Dead players cannot act." };

    const events: DomainEvent[] = [];
    const result = ActiveSkills.handleActiveSkill(state, command, events, deckManager);
    if (result && typeof result === "object" && "success" in result) {
      return result as CommandResult;
    }
    return { success: Boolean(result), events };
  }

  // Check manipulation card targetability
  private static canTargetAnyZone(
    state: SimulationState,
    player: EnginePlayer,
    target: EnginePlayer,
    card: EngineCard,
    exactDistance?: number
  ): boolean {
    const distOpts =
      exactDistance !== undefined ? { exactDistance } : { requiresRange: false };
    if (
      target.handCards.length > 0 &&
      TargetValidator.validate(state, card, player, target, {
        ...distOpts,
        targetArea: "HAND",
      }).valid
    ) {
      return true;
    }
    const equipped = getAllEquippedCards(target);
    if (
      equipped.length > 0 &&
      TargetValidator.validate(state, card, player, target, {
        ...distOpts,
        targetArea: "EQUIPMENT",
        targetCardId: equipped[0].id,
      }).valid
    ) {
      return true;
    }
    if (
      (target.greenCards?.length ?? 0) > 0 &&
      TargetValidator.validate(state, card, player, target, {
        ...distOpts,
        targetArea: "GREEN",
        targetCardId: target.greenCards[0].id,
      }).valid
    ) {
      return true;
    }
    if (
      (target.judgements?.length ?? 0) > 0 &&
      TargetValidator.validate(state, card, player, target, {
        ...distOpts,
        targetArea: "JUDGEMENT",
        targetCardId: target.judgements[0].id,
      }).valid
    ) {
      return true;
    }
    return false;
  }

  // Check Phase 2 card playability
  public static isCardPlayableInPhase2(
    state: SimulationState,
    player: EnginePlayer,
    card: EngineCard
  ): boolean {
    if (player.isDead) return false;
    if (EventEngine.shouldBlockPlayCard(state, player, card)) return false;

    const def = CardRegistry.get(card);
    if (!def) return false;

    const isBangSub =
      card.name === "MISSED!" && SkillHooks.canSubstituteCard(player, card, "BANG", state);

    if (def.zone === "REACTION_ONLY" && !isBangSub) {
      return false;
    }

    if (def.extraHandDiscard > 0) {
      const extraCount = player.handCards.filter((c) => c.id !== card.id).length;
      if (extraCount < def.extraHandDiscard) return false;
    }

    const others = Array.from(state.players.values()).filter(
      (p) => !p.isDead && p.id !== player.id
    );

    if (def.name === "BANG!" || isBangSub) {
      if (
        isBangSub &&
        EventEngine.shouldBlockPlayCard(state, player, { ...card, name: "BANG!" })
      ) {
        return false;
      }
      if (
        state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET" &&
        others.some(
          (t) =>
            getAllEquippedCards(t).length > 0 ||
            (t.greenCards?.length ?? 0) > 0 ||
            (t.judgements?.length ?? 0) > 0
        )
      ) {
        return true;
      }
      const hasReachableTarget = others.some(
        (t) => TargetValidator.validate(state, card, player, t).valid
      );
      if (
        state.activeEvent?.effectCode === "EVENT_FOC_SNIPER" &&
        hasReachableTarget &&
        player.handCards.some(
          (c) =>
            c.id !== card.id &&
            (c.name === "BANG!" ||
              (c.name === "MISSED!" &&
                SkillHooks.hasSkill(player, "Calamity Janet", state)))
        )
      ) {
        return true;
      }
      if (!BangLimiter.canPlayBang(state, player)) return false;
      return hasReachableTarget;
    }

    if (CardRegistry.isEquippableCard(card)) {
      if (def.slotKey === "weapon") {
        return player.equipments.weapon?.name !== card.name;
      }
      if (def.name === "JAIL") {
        return others.some(
          (t) => TargetValidator.validate(state, card, player, t, { requiresRange: false }).valid
        );
      }
      if (def.name === "DYNAMITE") {
        return !player.judgements.some(
          (j) => j.type === "DYNAMITE" || j.card.name === card.name
        );
      }
      if (def.zone === "EQUIP_BLUE") {
        if (def.slotKey === "horseDef") return !player.equipments.horseDef;
        if (def.slotKey === "horseOff") return !player.equipments.horseOff;
        if (def.slotKey === "barrel") return !player.equipments.barrel;
        return !hasEquippedCardByName(player, card.name);
      }
      if (def.zone === "EQUIP_GREEN") {
        return !(player.greenCards || []).some((g) => g.card.name === card.name);
      }
    }

    if (
      def.targeting.scope === "SELF" ||
      def.targeting.scope === "ALL_LIVING" ||
      def.targeting.scope === "ALL_OTHERS"
    ) {
      return true;
    }

    if (def.targeting.scope === "SINGLE_ANY") {
      return Array.from(state.players.values()).some((p) => !p.isDead && !p.isGhost);
    }

    if (def.targeting.scope === "SINGLE_OTHER") {
      const exactDistance = def.targeting.distance === "EXACT_1" ? 1 : undefined;
      if (CardRegistry.isManipulationCard(card)) {
        return others.some((t) =>
          this.canTargetAnyZone(state, player, t, card, exactDistance)
        );
      }
      const valOpts =
        exactDistance !== undefined ? { exactDistance } : { requiresRange: false };
      return others.some((t) => TargetValidator.validate(state, card, player, t, valOpts).valid);
    }

    return false;
  }
}
