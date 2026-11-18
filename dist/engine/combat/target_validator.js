"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetValidator = void 0;
const distance_calculator_1 = require("../board/distance_calculator");
const skill_hooks_1 = require("../interact/skill_hooks");
const inventory_1 = require("../utils/inventory");
const AREA_CARDS = new Set([
    "CAT BALOU",
    "PANIC!",
    "RAG TIME",
    "CAN CAN",
    "CONESTOGA",
    "RICOCHET",
]);
class TargetValidator {
    // Validate target card presence in area
    static validateTargetArea(targetPlayer, targetArea, targetCardId) {
        if (targetArea === "HAND") {
            if (targetPlayer.handCards.length === 0) {
                return { valid: false, reason: "Target player has no cards in hand." };
            }
            return { valid: true, target: targetPlayer };
        }
        if (targetArea === "EQUIPMENT") {
            const equipped = (0, inventory_1.getAllEquippedCards)(targetPlayer);
            if (equipped.length === 0) {
                return { valid: false, reason: "Target player has no equipment in play." };
            }
            if (targetCardId && !equipped.some((c) => c.id === targetCardId)) {
                return { valid: false, reason: "Target equipment card not found." };
            }
            return { valid: true, target: targetPlayer };
        }
        if (targetArea === "GREEN") {
            const greens = targetPlayer.greenCards || [];
            if (greens.length === 0) {
                return { valid: false, reason: "Target player has no green cards in play." };
            }
            if (targetCardId &&
                !greens.some((g) => g.id === targetCardId || g.card.id === targetCardId)) {
                return { valid: false, reason: "Target green card not found." };
            }
            return { valid: true, target: targetPlayer };
        }
        if (targetArea === "JUDGEMENT") {
            const judgements = targetPlayer.judgements || [];
            if (judgements.length === 0) {
                return { valid: false, reason: "Target player has no judgement cards in play." };
            }
            if (targetCardId &&
                !judgements.some((j) => j.id === targetCardId || j.card.id === targetCardId)) {
                return { valid: false, reason: "Target judgement card not found." };
            }
            return { valid: true, target: targetPlayer };
        }
        return { valid: false, reason: `Unsupported target area: ${targetArea}` };
    }
    static validate(arg1, arg2, arg3, arg4, arg5) {
        const isStateFirst = "players" in arg1 && "roomId" in arg1;
        const state = isStateFirst
            ? arg1
            : arg4 && !(arg4 instanceof Map) && "players" in arg4
                ? arg4
                : undefined;
        const players = isStateFirst
            ? arg1.players
            : arg4 instanceof Map
                ? arg4
                : arg4.players;
        const card = (isStateFirst ? arg2 : arg1);
        const fromPlayer = (isStateFirst ? arg3 : arg2);
        const targetPlayer = (isStateFirst ? arg4 : arg3);
        const options = arg5;
        if (!targetPlayer) {
            return { valid: false, reason: "Target player is required." };
        }
        if (targetPlayer.isDead || (!targetPlayer.isGhost && targetPlayer.hp <= 0)) {
            return { valid: false, reason: "Target is dead" };
        }
        const isRicochetShot = card.name === "RICOCHET" ||
            (card.name === "BANG!" && Boolean(options?.targetArea && options.targetArea !== "HAND"));
        const selfAllowedByCard = card.name === "TEQUILA" ||
            card.name === "BEER" ||
            card.name === "WHISKY" ||
            card.name === "SALOON" ||
            card.name === "CANTEEN";
        const allowSelf = options?.allowSelf ?? selfAllowedByCard;
        if (!allowSelf && targetPlayer.id === fromPlayer.id) {
            return { valid: false, reason: `Cannot target yourself with ${card.name}.` };
        }
        if (card.name === "JAIL") {
            if (targetPlayer.isSheriff) {
                return { valid: false, reason: "Cannot put Sheriff in Jail." };
            }
            if (targetPlayer.judgements.some((j) => j.type === "JAIL")) {
                return { valid: false, reason: "Target player is already in Jail." };
            }
            return { valid: true, target: targetPlayer };
        }
        // Determine card distance constraints
        let requiresRange = options?.requiresRange;
        let exactDistance = options?.exactDistance;
        if (exactDistance === undefined && requiresRange === undefined) {
            if (card.name === "DERRINGER" ||
                card.name === "KNIFE" ||
                card.name === "PUNCH" ||
                card.name === "PANIC!") {
                exactDistance = 1;
            }
            else if (card.name === "PEPPERBOX" ||
                (card.name === "BANG!" && !isRicochetShot) ||
                (card.name === "MISSED!" && skill_hooks_1.SkillHooks.hasSkill(fromPlayer, "Calamity Janet", state))) {
                requiresRange = true;
            }
            else {
                requiresRange = false;
            }
        }
        const dist = state
            ? distance_calculator_1.DistanceCalculator.calculateDistance(state, fromPlayer, targetPlayer)
            : distance_calculator_1.DistanceCalculator.calculateDistance(players, fromPlayer.id, targetPlayer.id);
        if (exactDistance !== undefined) {
            if (dist !== exactDistance) {
                return {
                    valid: false,
                    reason: `${card.name} only reaches targets at distance ${exactDistance}. Current distance: ${dist}.`,
                };
            }
        }
        else if (requiresRange) {
            const range = options?.customWeaponRange ??
                (state
                    ? distance_calculator_1.DistanceCalculator.getAttackerWeaponRange(state, fromPlayer)
                    : fromPlayer.equipments.weapon?.weaponRange ?? 1);
            if (dist > range) {
                return {
                    valid: false,
                    reason: `Target is out of range. Distance: ${dist}, Weapon Range: ${range}.`,
                };
            }
        }
        if (options?.targetArea && (AREA_CARDS.has(card.name) || isRicochetShot)) {
            return this.validateTargetArea(targetPlayer, options.targetArea, options.targetCardId);
        }
        return { valid: true, target: targetPlayer };
    }
}
exports.TargetValidator = TargetValidator;
