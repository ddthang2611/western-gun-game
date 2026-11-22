"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArenaChainManager = exports.ARENA_PLACEMENT_RETURN_MS = exports.ARENA_HOLD_NO_NEW_CARD_MS = exports.ARENA_HOLD_CHAIN_MS = exports.ARENA_HOLD_SIMPLE_MS = exports.ARENA_STEP_BUFFER_MS = exports.ARENA_BATCH_STAGGER_MS = exports.ARENA_FLIGHT_MS = void 0;
const inventory_1 = require("../utils/inventory");
const card_registry_1 = require("../cards/card_registry");
exports.ARENA_FLIGHT_MS = 420;
exports.ARENA_BATCH_STAGGER_MS = 340;
exports.ARENA_STEP_BUFFER_MS = 100;
exports.ARENA_HOLD_SIMPLE_MS = 950;
exports.ARENA_HOLD_CHAIN_MS = 1450;
exports.ARENA_HOLD_NO_NEW_CARD_MS = 750;
exports.ARENA_PLACEMENT_RETURN_MS = 420;
class ArenaChainManager {
    static createIdleChain() {
        return {
            chainId: "",
            status: "IDLE",
            entries: [],
            stepLockUntil: 0,
            settleUntil: 0,
        };
    }
    static ensureChain(state) {
        if (!state.arenaChain || !Array.isArray(state.arenaChain.entries)) {
            state.arenaChain = this.createIdleChain();
        }
        return state.arenaChain;
    }
    // Map blue card to fixed slot
    static resolveEquipmentSlotKey(card) {
        const slotKey = card_registry_1.CardRegistry.getSlotKey(card);
        if (slotKey)
            return slotKey;
        if (card.category === "weapon" || Boolean(card.weaponRange)) {
            return "weapon";
        }
        return "hideout";
    }
    // Find actual equipped Barrel card (with real artwork/suit/rank)
    static getRealBarrelCard(player) {
        const equipped = player.equipments?.barrel ||
            (0, inventory_1.getAllEquippedCards)(player).find((c) => (0, inventory_1.normalizeEquipName)(String(c.name || "").toUpperCase()) === "BARREL");
        if (equipped) {
            return { ...equipped };
        }
        return {
            id: `barrel_ref_${player.id}`,
            seq: 0,
            templateId: "base_barrel",
            pack: "base",
            name: "BARREL",
            border: "blue",
            category: "equipment",
            rank: "Q",
            suit: "spades",
            desc: "Check the top card to cancel BANG! on Hearts.",
            image: "/assets/images/cards/card_barrel.png",
        };
    }
    // Build face-up reference card for Jourdonnais innate check
    static buildJourdonnaisCard(player) {
        const hero = player.characters.find((c) => c.name.toLowerCase() === "jourdonnais") ||
            (player.copiedCharacter?.name.toLowerCase() === "jourdonnais"
                ? player.copiedCharacter
                : undefined) ||
            player.characters[0];
        return {
            id: `jourdonnais_ref_${player.id}_${Date.now()}`,
            seq: 0,
            templateId: "jourdonnais_skill",
            pack: "base",
            name: "JOURDONNAIS",
            border: "blue",
            category: "skill",
            rank: "Q",
            suit: "hearts",
            desc: hero?.desc || "Innate Barrel: check the top card when targeted by BANG!.",
            image: hero?.image || "/assets/images/cards/card_barrel.png",
        };
    }
    // Calculate total flight time for a batch of newly appended cards
    static calcBatchFlightMs(batchCount) {
        if (batchCount <= 0)
            return 0;
        return (batchCount - 1) * exports.ARENA_BATCH_STAGGER_MS + exports.ARENA_FLIGHT_MS;
    }
    // Append one or more entries into the current resolution chain
    static appendBatch(state, drafts, now = Date.now()) {
        if (!drafts || drafts.length === 0)
            return [];
        const chain = this.ensureChain(state);
        if (!chain.chainId || chain.status === "IDLE") {
            state.arenaChainCounter = (state.arenaChainCounter || 0) + 1;
            chain.chainId = `chain_${state.arenaChainCounter}`;
            chain.entries = [];
            chain.status = "ACTIVE_CHAIN";
            chain.stepLockUntil = 0;
            chain.settleUntil = 0;
        }
        const nextBatchIndex = chain.entries.length > 0
            ? chain.entries[chain.entries.length - 1].batchIndex + 1
            : 0;
        const added = drafts.map((draft) => {
            const stepIndex = chain.entries.length;
            const defaultLabel = draft.targetPlayerName
                ? `${draft.card.name} -> ${draft.targetPlayerName}`
                : draft.card.name;
            const entry = {
                id: `${chain.chainId}_s${stepIndex}`,
                stepIndex,
                batchIndex: nextBatchIndex,
                kind: draft.kind,
                card: { ...draft.card },
                actorPlayerId: draft.actorPlayerId,
                actorPlayerName: draft.actorPlayerName,
                targetPlayerId: draft.targetPlayerId,
                targetPlayerName: draft.targetPlayerName,
                originZone: draft.originZone,
                originSlotKey: draft.originSlotKey,
                destinationZone: draft.destinationZone,
                destinationPlayerId: draft.destinationPlayerId,
                destinationSlotKey: draft.destinationSlotKey,
                actionLabel: draft.actionLabel || defaultLabel,
                outcome: draft.outcome,
                vfxType: draft.vfxType,
                vfxTargetId: draft.vfxTargetId,
                vfxAoe: draft.vfxAoe,
                addedAt: now,
            };
            chain.entries.push(entry);
            return entry;
        });
        return added;
    }
    // Transition chain to ACTIVE_CHAIN or SETTLING after a command finishes
    static finalizeAfterCommand(state, entriesBeforeCount, enablePacing, now = Date.now()) {
        const chain = this.ensureChain(state);
        if (chain.entries.length === 0) {
            chain.status = "IDLE";
            chain.chainId = "";
            chain.stepLockUntil = 0;
            chain.settleUntil = 0;
            return;
        }
        const addedCount = Math.max(0, chain.entries.length - entriesBeforeCount);
        const flightMs = this.calcBatchFlightMs(addedCount);
        // Keep chain active for pending reactions or activeChain
        if ((state.pendingReactions.length > 0 || state.activeChain.length > 0) && !state.gameOver) {
            chain.status = "ACTIVE_CHAIN";
            chain.settleUntil = 0;
            chain.stepLockUntil =
                enablePacing && addedCount > 0
                    ? now + Math.max(0, flightMs - 60)
                    : 0;
            return;
        }
        // Resolution chain complete -> hold all cards in Card Arena before clearing
        chain.status = "SETTLING";
        chain.stepLockUntil = 0;
        if (!enablePacing) {
            chain.settleUntil = 0;
            return;
        }
        const isMultiOrCheck = chain.entries.length > 1 ||
            chain.entries.some((e) => e.kind === "CHECK_RESULT" || e.kind === "DEFENSE_CARD");
        const hasPlacement = chain.entries.some((e) => e.kind === "EQUIP_PLACEMENT");
        const holdMs = addedCount === 0
            ? exports.ARENA_HOLD_NO_NEW_CARD_MS
            : isMultiOrCheck
                ? exports.ARENA_HOLD_CHAIN_MS
                : exports.ARENA_HOLD_SIMPLE_MS;
        const placementExtra = hasPlacement ? 120 : 0;
        chain.settleUntil = now + flightMs + holdMs + placementExtra;
    }
    // Clear Card Arena once settling window completes
    static completeSettling(state) {
        const chain = this.ensureChain(state);
        if (chain.status !== "SETTLING" && chain.entries.length === 0) {
            return false;
        }
        if (chain.status !== "SETTLING") {
            return false;
        }
        state.arenaChain = this.createIdleChain();
        return true;
    }
    // Authoritative command guard while Card Arena is resolving
    static checkCommandAllowed(state, command, enablePacing, now = Date.now()) {
        if (command.type === "SELECT_CHARACTERS") {
            return { allowed: true };
        }
        const chain = this.ensureChain(state);
        if (chain.status === "SETTLING") {
            if (enablePacing && chain.settleUntil > 0 && now < chain.settleUntil) {
                return {
                    allowed: false,
                    message: "Wait for Card Arena cards to finish clearing.",
                };
            }
            // Window elapsed or pacing disabled -> clear cleanly to avoid deadlocks
            this.completeSettling(state);
            return { allowed: true, autoCleared: true };
        }
        if (chain.status === "ACTIVE_CHAIN") {
            if (state.pendingReactions.length === 0 && state.activeChain.length === 0) {
                this.completeSettling(state);
                state.arenaChain = this.createIdleChain();
                return { allowed: true, autoCleared: true };
            }
            if (state.activeChain.length > 0 && command.type === "SELECT_STOLEN_CARD") {
                return { allowed: true };
            }
            if (command.type === "RESOLVE_REACTION") {
                if (enablePacing && chain.stepLockUntil > 0 && now < chain.stepLockUntil) {
                    return {
                        allowed: false,
                        message: "Wait for current Card Arena step to finish landing.",
                    };
                }
                return { allowed: true };
            }
            // Non-reaction commands are blocked while chain is active
            return {
                allowed: false,
                message: "Wait for the current Card Arena chain to finish.",
            };
        }
        return { allowed: true };
    }
}
exports.ArenaChainManager = ArenaChainManager;
