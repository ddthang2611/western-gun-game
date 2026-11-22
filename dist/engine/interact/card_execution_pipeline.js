"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardExecutionPipeline = void 0;
const target_validator_1 = require("../combat/target_validator");
const bang_limiter_1 = require("../combat/bang_limiter");
const event_engine_1 = require("../events/event_engine");
const seat_manager_1 = require("../board/seat_manager");
const card_registry_1 = require("../cards/card_registry");
const arena_chain_manager_1 = require("../arena/arena_chain_manager");
const skill_hooks_1 = require("./skill_hooks");
const skill_trigger_bus_1 = require("./skill_trigger_bus");
const atomic_effects_1 = require("./primitives/atomic_effects");
const aoe_pipeline_1 = require("./pipeline/aoe_pipeline");
const single_target_1 = require("./handlers/single_target");
const aoe_actions_1 = require("./handlers/aoe_actions");
const inventory_1 = require("../utils/inventory");
class CardExecutionPipeline {
    // Execute phase 2 hand card play
    static executeHandPlay(state, player, card, cardIndex, command, deckManager) {
        const validated = this.validateHandPlay(state, player, card, cardIndex, command);
        if (!validated.ok) {
            return { success: false, message: validated.message };
        }
        const result = this.runLifecycle(state, player, validated.plan, command, deckManager);
        return this.clearForcedPlayIfMatched(player, card.id, result);
    }
    // Execute green card activation
    static executeGreenActivation(state, command, deckManager) {
        const player = state.players.get(command.playerId);
        if (!player)
            return { success: false, message: "Player not found." };
        if (player.isDead)
            return { success: false, message: "Dead players cannot act." };
        const validated = this.validateGreenActivation(state, player, command);
        if (!validated.ok) {
            return { success: false, message: validated.message };
        }
        return this.runLifecycle(state, player, validated.plan, command, deckManager);
    }
    // Clear forced Law of the West card
    static clearForcedPlayIfMatched(player, playedCardId, result) {
        if (result.success && playedCardId && player.forcedPlayCardId === playedCardId) {
            player.forcedPlayCardId = null;
        }
        return result;
    }
    // Run 7-step card lifecycle
    static runLifecycle(state, player, plan, command, deckManager) {
        const events = [];
        // Step 2: Consume source and cost cards
        const prevBangCount = state.bangCountThisTurn;
        this.consumeCards(state, player, plan, deckManager);
        // Step 3: Record arena chain entries
        this.recordArenaEntries(state, player, plan);
        // Step 4: Post-consume Suzy Lafayette check
        if (plan.originZone === "HAND") {
            skill_trigger_bus_1.SkillTriggerBus.onHandCardsConsumed(state, player, events, deckManager);
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
    static validateHandPlay(state, player, card, cardIndex, command) {
        const blockReason = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, card);
        if (blockReason) {
            return { ok: false, message: blockReason };
        }
        const isBangSubstitute = card.name === "MISSED!" && skill_hooks_1.SkillHooks.canSubstituteCard(player, card, "BANG", state);
        const def = isBangSubstitute ? card_registry_1.CardRegistry.get("BANG!") : card_registry_1.CardRegistry.get(card);
        if (isBangSubstitute) {
            const bangBlock = event_engine_1.EventEngine.shouldBlockPlayCard(state, player, {
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
        const isEquip = isWeaponEquip ||
            isBlueEquip ||
            isGreenEquip ||
            def?.zone === "JUDGEMENT" ||
            card.category === "judgement" ||
            card.name === "JAIL" ||
            card.name === "DYNAMITE";
        if (isEquip) {
            const equipSlotKey = def?.slotKey ?? arena_chain_manager_1.ArenaChainManager.resolveEquipmentSlotKey(card);
            if (isWeaponEquip) {
                if (player.equipments.weapon?.name === card.name) {
                    return { ok: false, message: `You already have ${card.name} equipped.` };
                }
            }
            else if (card.name === "JAIL") {
                const val = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
                    requiresRange: false,
                });
                if (!val.valid) {
                    return { ok: false, message: val.reason ?? "Invalid target for Jail." };
                }
            }
            else if (card.name === "DYNAMITE") {
                if (player.judgements.some((j) => j.type === "DYNAMITE" || j.card.name === card.name)) {
                    return { ok: false, message: "You already have Dynamite in play." };
                }
            }
            else if (isBlueEquip) {
                if (equipSlotKey === "horseDef" && player.equipments.horseDef) {
                    return { ok: false, message: "You already have Mustang equipped." };
                }
                if (equipSlotKey === "horseOff" && player.equipments.horseOff) {
                    return { ok: false, message: "You already have Scope equipped." };
                }
                if (equipSlotKey === "barrel" && player.equipments.barrel) {
                    return { ok: false, message: "You already have Barrel equipped." };
                }
                if (equipSlotKey !== "horseDef" &&
                    equipSlotKey !== "horseOff" &&
                    equipSlotKey !== "barrel" &&
                    (0, inventory_1.hasEquippedCardByName)(player, card.name)) {
                    return { ok: false, message: `You already have ${card.name} equipped.` };
                }
            }
            else if (isGreenEquip) {
                if (player.greenCards.some((g) => g.card.name === card.name)) {
                    return { ok: false, message: `You already have ${card.name} in play.` };
                }
            }
            const isImmuneShortcut = card.name === "JAIL" &&
                Boolean(targetPlayer && skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state));
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
        const isRicochet = isBangCard &&
            code === "EVENT_FOC_RICOCHET" &&
            Boolean(command.targetArea && command.targetArea !== "HAND");
        let resolvedRicochetCardId;
        let sniperExtraCard;
        if (isBangCard) {
            if (!targetPlayer) {
                return { ok: false, message: "Target required for BANG!." };
            }
            if (isRicochet && command.targetArea) {
                if (command.targetArea !== "EQUIPMENT" &&
                    command.targetArea !== "GREEN" &&
                    command.targetArea !== "JUDGEMENT") {
                    return { ok: false, message: "Ricochet targets cards in play only." };
                }
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
                    targetArea: command.targetArea,
                    targetCardId: command.targetCardId,
                    requiresRange: false,
                });
                if (!validation.valid) {
                    return { ok: false, message: validation.reason ?? "Invalid target." };
                }
                resolvedRicochetCardId = single_target_1.SingleTargetActions.resolveRicochetTargetCardId(targetPlayer, command.targetArea, command.targetCardId);
                if (!resolvedRicochetCardId) {
                    return { ok: false, message: "Target card not found in play." };
                }
            }
            else {
                if (code === "EVENT_FOC_SNIPER" &&
                    command.discardCardIds &&
                    command.discardCardIds.length > 0) {
                    const extraId = command.discardCardIds[0];
                    const candidate = extraId !== card.id
                        ? player.handCards.find((c) => c.id === extraId)
                        : undefined;
                    const isBangLike = candidate &&
                        (candidate.name === "BANG!" ||
                            (candidate.name === "MISSED!" &&
                                skill_hooks_1.SkillHooks.hasSkill(player, "Calamity Janet", state)));
                    if (!isBangLike) {
                        return {
                            ok: false,
                            message: "Sniper requires discarding a second BANG! card.",
                        };
                    }
                    sniperExtraCard = candidate;
                }
                if (!sniperExtraCard && !bang_limiter_1.BangLimiter.canPlayBang(state, player)) {
                    return {
                        ok: false,
                        message: "You have already reached the BANG! limit this turn.",
                    };
                }
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
                    requiresRange: true,
                });
                if (!validation.valid) {
                    return { ok: false, message: validation.reason ?? "Invalid target." };
                }
            }
        }
        // Parameterized extra hand discard validation
        let extraCostCard;
        if (def.extraHandDiscard > 0) {
            const extraRes = this.validateExtraDiscard(player, card, command.discardCardIds?.[0]);
            if (!extraRes.ok) {
                return extraRes;
            }
            extraCostCard = extraRes.extraCard;
        }
        let resolvedTarget = targetPlayer;
        let targetArea;
        let targetCardId;
        if (card.name === "TEQUILA") {
            resolvedTarget = targetPlayer ?? player;
            if (resolvedTarget.isDead || resolvedTarget.isGhost) {
                return { ok: false, message: "Target player cannot regain life points." };
            }
        }
        else if (!isBangCard && def.targeting.scope === "SINGLE_OTHER") {
            if (!targetPlayer) {
                return { ok: false, message: `Target required for ${card.name}.` };
            }
            if (card_registry_1.CardRegistry.isManipulationCard(card)) {
                targetArea = command.targetArea || "HAND";
                targetCardId = command.targetCardId;
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
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
            }
            else {
                const valOpts = def.targeting.distance === "EXACT_1"
                    ? { exactDistance: 1 }
                    : { requiresRange: false };
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, valOpts);
                if (!validation.valid) {
                    return { ok: false, message: validation.reason ?? "Invalid target." };
                }
            }
        }
        const usesImmunityShortcut = def.checkApacheKid &&
            !def.combat.reactionType &&
            def.targeting.scope !== "ALL_OTHERS" &&
            def.targeting.scope !== "ALL_LIVING" &&
            Boolean(resolvedTarget && resolvedTarget.id !== player.id) &&
            skill_hooks_1.SkillHooks.isImmuneToCard(resolvedTarget, card, player, state);
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
    static validateGreenActivation(state, player, command) {
        const requestedGreenId = command.greenCardId ?? command.cardId;
        if (!requestedGreenId) {
            return { ok: false, message: "Green card ID is required." };
        }
        const greenCards = player.greenCards || [];
        const greenIndex = greenCards.findIndex((g) => g.id === requestedGreenId || g.card.id === requestedGreenId);
        if (greenIndex === -1) {
            return { ok: false, message: "Green card not found in play." };
        }
        const greenEntry = greenCards[greenIndex];
        const card = greenEntry.card;
        const def = card_registry_1.CardRegistry.get(card);
        if (card_registry_1.CardRegistry.isGreenDefenseCard(card)) {
            return {
                ok: false,
                message: `${card.name} can only be activated during an attack reaction.`,
            };
        }
        if (!card_registry_1.CardRegistry.isGreenActiveCard(card) || !def) {
            return { ok: false, message: `Unsupported green card: ${card.name}` };
        }
        if (greenEntry.isDelay) {
            return {
                ok: false,
                message: "Green card cannot be activated on the turn it was played.",
            };
        }
        const turnPlayer = state.players.get(state.turnPlayerId);
        if (!skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer ?? player, state)) {
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
        let targetArea;
        let targetCardId;
        if (def.targeting.scope === "SINGLE_OTHER") {
            if (!targetPlayer) {
                return { ok: false, message: `Target required for ${card.name}.` };
            }
            if (card_registry_1.CardRegistry.isManipulationCard(card)) {
                targetArea = command.targetArea || "HAND";
                targetCardId = command.targetCardId;
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, {
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
            }
            else {
                const valOpts = def.targeting.distance === "WEAPON_RANGE"
                    ? { requiresRange: true }
                    : def.targeting.distance === "EXACT_1"
                        ? { exactDistance: 1 }
                        : { requiresRange: false };
                const validation = target_validator_1.TargetValidator.validate(state, card, player, targetPlayer, valOpts);
                if (!validation.valid) {
                    return { ok: false, message: validation.reason ?? "Invalid target." };
                }
            }
        }
        const usesImmunityShortcut = def.checkApacheKid &&
            !def.combat.reactionType &&
            def.targeting.scope === "SINGLE_OTHER" &&
            Boolean(targetPlayer && skill_hooks_1.SkillHooks.isImmuneToCard(targetPlayer, card, player, state));
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
    static validateExtraDiscard(player, card, extraCardId) {
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
    static hasTargetCard(targetPlayer, targetArea, targetCardId) {
        if (targetArea === "HAND")
            return targetPlayer.handCards.length > 0;
        if (!targetCardId)
            return false;
        if (targetArea === "EQUIPMENT") {
            return (0, inventory_1.getAllEquippedCards)(targetPlayer).some((c) => c.id === targetCardId);
        }
        if (targetArea === "GREEN") {
            return (targetPlayer.greenCards || []).some((g) => g.id === targetCardId || g.card.id === targetCardId);
        }
        if (targetArea === "JUDGEMENT") {
            return (targetPlayer.judgements || []).some((j) => j.id === targetCardId || j.card.id === targetCardId);
        }
        return false;
    }
    // Step 2: Consume played and cost cards
    static consumeCards(state, player, plan, deckManager) {
        if (plan.originZone === "GREEN") {
            const removedGreen = (player.greenCards || []).splice(plan.greenIndex, 1)[0];
            if (removedGreen) {
                atomic_effects_1.AtomicEffects.discardCard(state, removedGreen.card, deckManager);
            }
            return;
        }
        const idsToRemove = [plan.card.id];
        if (plan.extraCostCard)
            idsToRemove.push(plan.extraCostCard.id);
        if (plan.sniperExtraCard)
            idsToRemove.push(plan.sniperExtraCard.id);
        const idSet = new Set(idsToRemove);
        const removed = [];
        player.handCards = player.handCards.filter((c) => {
            if (idSet.has(c.id)) {
                removed.push(c);
                return false;
            }
            return true;
        });
        if (plan.isEquip) {
            if (plan.isWeaponEquip && player.equipments.weapon) {
                atomic_effects_1.AtomicEffects.discardCard(state, player.equipments.weapon, deckManager);
            }
            else if (plan.isImmuneShortcut) {
                atomic_effects_1.AtomicEffects.discardCards(state, removed, deckManager);
            }
        }
        else {
            atomic_effects_1.AtomicEffects.discardCards(state, removed, deckManager);
        }
        if ((plan.card.name === "BANG!" || plan.isBangSubstitute) &&
            !plan.isRicochet &&
            !plan.sniperExtraCard) {
            state.bangCountThisTurn += 1;
        }
    }
    // Step 3: Append arena chain entries
    static recordArenaEntries(state, player, plan) {
        const { card, def, targetPlayer } = plan;
        if (plan.isEquip) {
            if (plan.isWeaponEquip) {
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
            }
            else if (card.name === "JAIL" && targetPlayer) {
                if (plan.isImmuneShortcut) {
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
                }
                else {
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
                }
            }
            else if (card.name === "DYNAMITE") {
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
            }
            else if (plan.isBlueEquip) {
                arena_chain_manager_1.ArenaChainManager.appendBatch(state, [
                    {
                        kind: "EQUIP_PLACEMENT",
                        card,
                        actorPlayerId: player.id,
                        actorPlayerName: player.name,
                        originZone: "HAND",
                        destinationZone: "EQUIPMENT",
                        destinationPlayerId: player.id,
                        destinationSlotKey: plan.equipSlotKey ?? arena_chain_manager_1.ArenaChainManager.resolveEquipmentSlotKey(card),
                        actionLabel: `Equip ${card.name}`,
                    },
                ]);
            }
            else {
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
            }
            return;
        }
        let actionLabel = targetPlayer ? `${card.name} -> ${targetPlayer.name}` : card.name;
        let vfxType;
        let vfxTargetId;
        let vfxAoe;
        if (plan.isRicochet && targetPlayer) {
            actionLabel = `Ricochet ${card.name} -> ${targetPlayer.name}`;
            vfxType = "bullet";
            vfxTargetId = targetPlayer.id;
        }
        else if (def?.drawOnPlay && !def.combat.reactionType) {
            actionLabel = `${card.name} (+${def.drawOnPlay})`;
            vfxType = "draw";
        }
        else if (card.name === "BEER") {
            const livingCount = seat_manager_1.SeatManager.getLivingContenders(state).length;
            actionLabel = livingCount <= 2 ? `${card.name} (No Effect)` : `${card.name} (+HP)`;
            vfxType = livingCount > 2 ? "heal" : undefined;
            vfxTargetId = player.id;
        }
        else if (card.name === "SALOON") {
            actionLabel = `${card.name} (+1 HP All)`;
            vfxType = "heal";
            vfxAoe = true;
        }
        else if (card.name === "WHISKY") {
            actionLabel = `${card.name} (+2 HP)`;
            vfxType = "heal";
            vfxTargetId = player.id;
        }
        else if (card.name === "CANTEEN") {
            actionLabel = `${card.name} (+1 HP)`;
            vfxType = "heal";
            vfxTargetId = player.id;
        }
        else if (card.name === "TEQUILA" && targetPlayer) {
            vfxType = plan.isImmuneShortcut ? undefined : "heal";
            vfxTargetId = targetPlayer.id;
        }
        else if (card.name === "DUEL" && targetPlayer) {
            vfxType = "bullet";
            vfxTargetId = targetPlayer.id;
        }
        else if (def?.combat.reactionType) {
            vfxType = "bullet";
            if (def.targeting.scope === "ALL_OTHERS") {
                vfxAoe = true;
            }
            else if (targetPlayer) {
                vfxTargetId = targetPlayer.id;
            }
        }
        const drafts = [
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
        arena_chain_manager_1.ArenaChainManager.appendBatch(state, drafts);
    }
    // Step 6: Execute resolved card effect
    static resolveEffect(state, player, plan, command, prevBangCount, deckManager) {
        const { card, def, targetPlayer } = plan;
        const events = [];
        if (plan.isEquip) {
            return this.resolveEquipPlacement(state, player, plan);
        }
        if (!def) {
            return { success: false, message: `Unsupported card: ${card.name}` };
        }
        // Draw-only cards: Stagecoach, Wells Fargo, Pony Express
        if (def.drawOnPlay && !def.combat.reactionType) {
            const { cards: drawn, events: drawEvents } = atomic_effects_1.AtomicEffects.drawCards(state, def.drawOnPlay, deckManager);
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
                const living = seat_manager_1.SeatManager.getLivingContenders(state);
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
                const beerHeal = skill_hooks_1.SkillHooks.getBeerHealAmount(player, state);
                if (beerHeal > 1 && skill_hooks_1.SkillHooks.hasSkill(player, "Tequila Joe", state)) {
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
                atomic_effects_1.AtomicEffects.applyHeal(state, player, 1, card, events, deckManager);
                return { success: true, events };
            }
            if (card.name === "SALOON") {
                const res = aoe_pipeline_1.AoePipeline.executeInstantAoe(state, player, card, "ALL_PLAYERS", (target) => {
                    const stepEvents = [];
                    if (skill_hooks_1.SkillHooks.isImmuneToCard(target, card, player, state)) {
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
                    atomic_effects_1.AtomicEffects.applyHeal(state, target, 1, card, stepEvents, deckManager);
                    return stepEvents;
                });
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
            atomic_effects_1.AtomicEffects.applyHeal(state, healTarget, def.healAmount, card, events, deckManager);
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
            return aoe_pipeline_1.AoePipeline.executeDraftStoreAoe(state, player, card, deckManager);
        }
        // Brawl AOE destruction
        if (card.name === "BRAWL") {
            return this.resolveBrawlEffect(state, player, card, command, deckManager);
        }
        // Steal or destroy manipulation
        if (def.manipulation && targetPlayer && plan.targetArea) {
            const isSteal = def.manipulation === "STEAL";
            const transferred = isSteal
                ? atomic_effects_1.AtomicEffects.stealCard(state, player, targetPlayer, plan.targetArea, plan.targetCardId, events, deckManager)
                : atomic_effects_1.AtomicEffects.destroyCard(state, player, targetPlayer, plan.targetArea, plan.targetCardId, events, deckManager);
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
            const reaction = {
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
            const res = aoe_pipeline_1.AoePipeline.executeReactionAoe(state, player, card, "ALL_OTHERS", () => ({
                type: reactionType,
                requiredCard,
                requiredCount: 1,
                allowBarrel,
                allowJourdonnais,
            }));
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
            const reactionRes = atomic_effects_1.AtomicEffects.createReaction(state, targetPlayer, player, card, {
                type: "EVENT_RICOCHET_DEFENSE",
                requiredCard: "MISSED",
                requiredCount: 1,
                allowBarrel: false,
                allowJourdonnais: false,
            }, {
                ricochetTargetArea: plan.targetArea,
                ricochetTargetCardId: plan.resolvedRicochetCardId,
            });
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
                const { cards: drawn, events: drawEvents } = atomic_effects_1.AtomicEffects.drawCards(state, def.drawOnPlay, deckManager);
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
            const reactionRes = atomic_effects_1.AtomicEffects.createReaction(state, targetPlayer, player, card, {
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
                if (prevBangCount >= 1 &&
                    player.equipments.weapon?.name !== "VOLCANIC" &&
                    skill_hooks_1.SkillHooks.hasSkill(player, "Willy the Kid", state)) {
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
                if (!reactionRes.isImmune &&
                    reactionRes.reaction &&
                    reactionRes.reaction.requiredCount >= 2 &&
                    !plan.sniperExtraCard &&
                    skill_hooks_1.SkillHooks.hasSkill(player, "Slab the Killer", state)) {
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
            }
            else if (card.name === "PUNCH") {
                if (!reactionRes.isImmune && reactionRes.reaction) {
                    events.push({
                        type: "PUNCH_LAUNCHED",
                        payload: { attackerId: player.id, targetId: targetPlayer.id, card },
                        timestamp: Date.now(),
                    });
                }
            }
            else if (card.name === "SPRINGFIELD") {
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
            }
            else if (plan.originZone === "GREEN") {
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
    static resolveEquipPlacement(state, player, plan) {
        const { card, targetPlayer } = plan;
        const events = [];
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
            const newJail = {
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
            const newDynamite = {
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
            const slotKey = plan.equipSlotKey ?? arena_chain_manager_1.ArenaChainManager.resolveEquipmentSlotKey(card);
            if (slotKey === "horseDef") {
                player.equipments.horseDef = card;
            }
            else if (slotKey === "horseOff") {
                player.equipments.horseOff = card;
            }
            else if (slotKey === "barrel") {
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
        const greenCard = {
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
    static resolveBrawlEffect(state, player, card, command, deckManager) {
        return aoe_actions_1.AoeActions.resolveBrawlTargets(state, player, card, command, deckManager);
    }
}
exports.CardExecutionPipeline = CardExecutionPipeline;
