"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EquipmentAction = void 0;
const event_engine_1 = require("../../events/event_engine");
const target_validator_1 = require("../../combat/target_validator");
const skill_hooks_1 = require("../skill_hooks");
const atomic_effects_1 = require("../primitives/atomic_effects");
const arena_chain_manager_1 = require("../../arena/arena_chain_manager");
const inventory_1 = require("../../utils/inventory");
class EquipmentAction {
    // Check if blue extra already equipped
    static hasExtraEquipName(player, cardName) {
        return (0, inventory_1.hasEquippedCardByName)(player, cardName);
    }
    // Equip blue, judgement, or green card
    static handleEquip(state, player, targetPlayer, card, cardIndex, deckManager) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { success: false, message: blockReason };
        }
        const isWeapon = card.category === "weapon" || (card.border === "blue" && Boolean(card.weaponRange));
        const isGreen = card.border === "green" ||
            card.category === "green_delayed" ||
            card.category === "green_delay";
        // Validate all preconditions before splicing
        if (isWeapon) {
            if (player.equipments.weapon?.name === card.name) {
                return { success: false, message: `You already have ${card.name} equipped.` };
            }
        }
        else if (card.name === "JAIL") {
            const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
                requiresRange: false,
            });
            if (!validation.valid) {
                return { success: false, message: validation.reason };
            }
        }
        else if (card.name === "DYNAMITE") {
            if (player.judgements.some((j) => j.type === "DYNAMITE" || j.card.name === card.name)) {
                return { success: false, message: "You already have Dynamite in play." };
            }
        }
        else if (card.border === "blue") {
            if (card.name === "MUSTANG" && player.equipments.horseDef) {
                return { success: false, message: "You already have Mustang equipped." };
            }
            if (card.name === "SCOPE" && player.equipments.horseOff) {
                return { success: false, message: "You already have Scope equipped." };
            }
            if (card.name === "BARREL" && player.equipments.barrel) {
                return { success: false, message: "You already have Barrel equipped." };
            }
            if (card.name !== "MUSTANG" &&
                card.name !== "SCOPE" &&
                card.name !== "BARREL" &&
                this.hasExtraEquipName(player, card.name)) {
                return { success: false, message: `You already have ${card.name} equipped.` };
            }
        }
        else if (isGreen) {
            if (player.greenCards.some((g) => g.card.name === card.name)) {
                return { success: false, message: `You already have ${card.name} in play.` };
            }
        }
        else {
            return { success: false, message: `Unsupported equipment: ${card.name}` };
        }
        // Consume card only after validation
        player.handCards.splice(cardIndex, 1);
        const events = [];
        if (isWeapon) {
            if (player.equipments.weapon) {
                atomic_effects_1.AtomicEffects.discardCard(state, player.equipments.weapon, deckManager);
            }
            player.equipments.weapon = card;
            arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        if (card.name === "JAIL" && targetPlayer) {
            if (skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state)) {
                atomic_effects_1.AtomicEffects.discardCard(state, card, deckManager);
                arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
                skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
                return { success: true, events };
            }
            state.attachedSeqCounter += 1;
            const newJail = {
                id: `jail_${Date.now()}_${card.id}`,
                card,
                type: "JAIL",
                attachedSeq: state.attachedSeqCounter,
                attachedTimestamp: Date.now(),
            };
            targetPlayer.judgements.push(newJail);
            arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        if (card.name === "DYNAMITE") {
            state.attachedSeqCounter += 1;
            const newDynamite = {
                id: `dynamite_${Date.now()}_${card.id}`,
                card,
                type: "DYNAMITE",
                attachedSeq: state.attachedSeqCounter,
                attachedTimestamp: Date.now(),
            };
            player.judgements.push(newDynamite);
            arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        if (card.border === "blue") {
            if (card.name === "MUSTANG") {
                player.equipments.horseDef = card;
            }
            else if (card.name === "SCOPE") {
                player.equipments.horseOff = card;
            }
            else if (card.name === "BARREL") {
                player.equipments.barrel = card;
            }
            else {
                const extras = player.equipments.extras ? [...player.equipments.extras] : [];
                if (player.equipments.extra &&
                    !extras.some((e) => e.id === player.equipments.extra.id)) {
                    extras.unshift(player.equipments.extra);
                }
                extras.push(card);
                player.equipments.extras = extras;
                player.equipments.extra = extras[0];
            }
            arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
                {
                    kind: "EQUIP_PLACEMENT",
                    card,
                    actorPlayerId: player.id,
                    actorPlayerName: player.name,
                    originZone: "HAND",
                    destinationZone: "EQUIPMENT",
                    destinationPlayerId: player.id,
                    destinationSlotKey: arena_chain_manager_1.ArenaChainManager.resolveEquipmentSlotKey(card),
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
            skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
            return { success: true, events };
        }
        const greenCard = {
            id: `green_${Date.now()}_${card.id}`,
            card,
            isDelay: true,
            attachedTurnRound: state.roundNumber,
        };
        player.greenCards.push(greenCard);
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
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
        skill_hooks_1.SkillHooks.checkSuzyLafayette(state, player, events);
        return { success: true, events };
    }
}
exports.EquipmentAction = EquipmentAction;
