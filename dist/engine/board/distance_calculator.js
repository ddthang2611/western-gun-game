"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistanceCalculator = void 0;
const seat_manager_1 = require("./seat_manager");
const skill_hooks_1 = require("../interact/skill_hooks");
const inventory_1 = require("../utils/inventory");
class DistanceCalculator {
    static calculateDistance(stateOrPlayers, fromArg, toArg) {
        const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;
        const players = stateOrPlayers instanceof Map ? stateOrPlayers : stateOrPlayers.players;
        const fromId = typeof fromArg === "string" ? fromArg : fromArg.id;
        const toId = typeof toArg === "string" ? toArg : toArg.id;
        if (fromId === toId)
            return 0;
        const alive = seat_manager_1.SeatManager.getAlivePlayers(players, true);
        const fromIndex = alive.findIndex((p) => p.id === fromId);
        const toIndex = alive.findIndex((p) => p.id === toId);
        if (fromIndex === -1 || toIndex === -1)
            return Infinity;
        const attacker = alive[fromIndex];
        const defender = alive[toIndex];
        const isAmbush = state?.activeEvent?.effectCode === "EVENT_FOC_AMBUSH";
        const count = alive.length;
        const diff = Math.abs(fromIndex - toIndex);
        const baseDistance = isAmbush ? 1 : Math.min(diff, count - diff);
        const turnPlayer = state ? state.players.get(state.turnPlayerId) : undefined;
        let defModifiers = 0;
        // Defender equipment distance bonuses
        if (skill_hooks_1.SkillHooks.isEquipmentEffective(defender, turnPlayer, state)) {
            if (defender.equipments.horseDef)
                defModifiers += 1;
            for (const card of (0, inventory_1.getAllEquippedCards)(defender)) {
                if (card.name === "HIDEOUT")
                    defModifiers += 1;
                if (card.name === "MUSTANG" && !defender.equipments.horseDef)
                    defModifiers += 1;
            }
        }
        // Ambush ignores character distance skills
        if (!isAmbush && skill_hooks_1.SkillHooks.hasSkill(defender, "Paul Regret", state)) {
            defModifiers += 1;
        }
        let offModifiers = 0;
        // Attacker equipment distance reductions
        if (skill_hooks_1.SkillHooks.isEquipmentEffective(attacker, turnPlayer, state)) {
            if (attacker.equipments.horseOff)
                offModifiers += 1;
            for (const card of (0, inventory_1.getAllEquippedCards)(attacker)) {
                if ((0, inventory_1.normalizeEquipName)(card.name) === "BINOCULAR")
                    offModifiers += 1;
                if (card.name === "SCOPE" && !attacker.equipments.horseOff)
                    offModifiers += 1;
            }
        }
        if (!isAmbush && skill_hooks_1.SkillHooks.hasSkill(attacker, "Rose Doolan", state)) {
            offModifiers += 1;
        }
        return Math.max(1, baseDistance + defModifiers - offModifiers);
    }
    // Get effective weapon range
    static getAttackerWeaponRange(state, attacker) {
        const turnPlayer = state.players.get(state.turnPlayerId);
        if (attacker.equipments.weapon &&
            skill_hooks_1.SkillHooks.isEquipmentEffective(attacker, turnPlayer, state)) {
            return attacker.equipments.weapon.weaponRange || 1;
        }
        return 1;
    }
    static isTargetInRange(stateOrPlayers, fromArg, toArg, customWeaponRange) {
        const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;
        const players = stateOrPlayers instanceof Map ? stateOrPlayers : stateOrPlayers.players;
        const fromPlayer = typeof fromArg === "string" ? players.get(fromArg) : fromArg;
        if (!fromPlayer)
            return false;
        const distance = state
            ? this.calculateDistance(state, fromArg, toArg)
            : this.calculateDistance(players, typeof fromArg === "string" ? fromArg : fromArg.id, typeof toArg === "string" ? toArg : toArg.id);
        const weaponRange = customWeaponRange ??
            (state
                ? this.getAttackerWeaponRange(state, fromPlayer)
                : fromPlayer.equipments.weapon?.weaponRange ?? 1);
        return distance <= weaponRange;
    }
}
exports.DistanceCalculator = DistanceCalculator;
