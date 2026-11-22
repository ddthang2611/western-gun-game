import { SimulationState, EnginePlayer } from "../../types/state";
import { EngineCard, ActiveJudgement, ActiveGreenCard } from "../../types/cards";
import { CommandResult, DomainEvent } from "../../types/actions";
import { DeckManager } from "../../deck/deck_manager";
import { EventEngine } from "../../events/event_engine";
import { TargetValidator } from "../../combat/target_validator";
import { SkillHooks } from "../skill_hooks";
import { AtomicEffects } from "../primitives/atomic_effects";
import { ArenaChainManager } from "../../arena/arena_chain_manager";
import { hasEquippedCardByName } from "../../utils/inventory";

export class EquipmentAction {
  // Check if blue extra already equipped
  private static hasExtraEquipName(player: EnginePlayer, cardName: string): boolean {
    return hasEquippedCardByName(player, cardName);
  }

  // Equip blue, judgement, or green card
  public static handleEquip(
    state: SimulationState,
    player: EnginePlayer,
    targetPlayer: EnginePlayer | undefined,
    card: EngineCard,
    cardIndex: number,
    deckManager?: DeckManager
  ): CommandResult {
    const blockReason = EventEngine.shouldBlockPlayCard(state, player, card);
    if (blockReason) {
      return { success: false, message: blockReason };
    }

    const isWeapon =
      card.category === "weapon" || (card.border === "blue" && Boolean(card.weaponRange));
    const isGreen =
      card.border === "green" ||
      card.category === "green_delayed" ||
      card.category === "green_delay";

    // Validate all preconditions before splicing
    if (isWeapon) {
      if (player.equipments.weapon?.name === card.name) {
        return { success: false, message: `You already have ${card.name} equipped.` };
      }
    } else if (card.name === "JAIL") {
      const validation = TargetValidator.validate(state, card, player, targetPlayer, {
        requiresRange: false,
      });
      if (!validation.valid) {
        return { success: false, message: validation.reason };
      }
    } else if (card.name === "DYNAMITE") {
      if (
        player.judgements.some(
          (j) => j.type === "DYNAMITE" || j.card.name === card.name
        )
      ) {
        return { success: false, message: "You already have Dynamite in play." };
      }
    } else if (card.border === "blue") {
      if (card.name === "MUSTANG" && player.equipments.horseDef) {
        return { success: false, message: "You already have Mustang equipped." };
      }
      if (card.name === "SCOPE" && player.equipments.horseOff) {
        return { success: false, message: "You already have Scope equipped." };
      }
      if (card.name === "BARREL" && player.equipments.barrel) {
        return { success: false, message: "You already have Barrel equipped." };
      }
      if (
        card.name !== "MUSTANG" &&
        card.name !== "SCOPE" &&
        card.name !== "BARREL" &&
        this.hasExtraEquipName(player, card.name)
      ) {
        return { success: false, message: `You already have ${card.name} equipped.` };
      }
    } else if (isGreen) {
      if (player.greenCards.some((g) => g.card.name === card.name)) {
        return { success: false, message: `You already have ${card.name} in play.` };
      }
    } else {
      return { success: false, message: `Unsupported equipment: ${card.name}` };
    }

    // Consume card only after validation
    player.handCards.splice(cardIndex, 1);
    const events: DomainEvent[] = [];

    if (isWeapon) {
      if (player.equipments.weapon) {
        AtomicEffects.discardCard(state, player.equipments.weapon, deckManager);
      }
      player.equipments.weapon = card;

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
      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    if (card.name === "JAIL" && targetPlayer) {
      if (SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
        AtomicEffects.discardCard(state, card, deckManager);
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
        events.push({
          type: "APACHE_KID_IMMUNITY",
          payload: {
            sourcePlayerId: player.id,
            targetPlayerId: targetPlayer.id,
            card,
          },
          timestamp: Date.now(),
        });
        SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
      }

      state.attachedSeqCounter += 1;
      const newJail: ActiveJudgement = {
        id: `jail_${Date.now()}_${card.id}`,
        card,
        type: "JAIL",
        attachedSeq: state.attachedSeqCounter,
        attachedTimestamp: Date.now(),
      };
      targetPlayer.judgements.push(newJail);

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
      SkillHooks.checkSuzyLafayette(state, player, events);
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

      events.push({
        type: "DYNAMITE_ATTACHED",
        payload: {
          playerId: player.id,
          seq: state.attachedSeqCounter,
          card,
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    if (card.border === "blue") {
      if (card.name === "MUSTANG") {
        player.equipments.horseDef = card;
      } else if (card.name === "SCOPE") {
        player.equipments.horseOff = card;
      } else if (card.name === "BARREL") {
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

      ArenaChainManager.appendBatch(state, [
        {
          kind: "EQUIP_PLACEMENT",
          card,
          actorPlayerId: player.id,
          actorPlayerName: player.name,
          originZone: "HAND",
          destinationZone: "EQUIPMENT",
          destinationPlayerId: player.id,
          destinationSlotKey: ArenaChainManager.resolveEquipmentSlotKey(card),
          actionLabel: `Equip ${card.name}`,
        },
      ]);

      events.push({
        type: "EQUIPMENT_EQUIPPED",
        payload: {
          playerId: player.id,
          playerName: player.name,
          card,
        },
        timestamp: Date.now(),
      });
      SkillHooks.checkSuzyLafayette(state, player, events);
      return { success: true, events };
    }

    const greenCard: ActiveGreenCard = {
      id: `green_${Date.now()}_${card.id}`,
      card,
      isDelay: true,
      attachedTurnRound: state.roundNumber,
    };
    player.greenCards.push(greenCard);

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

    events.push({
      type: "GREEN_CARD_EQUIPPED",
      payload: {
        playerId: player.id,
        playerName: player.name,
        card,
      },
      timestamp: Date.now(),
    });
    SkillHooks.checkSuzyLafayette(state, player, events);
    return { success: true, events };
  }
}
