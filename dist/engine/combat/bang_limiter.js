"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BangLimiter = void 0;
const skill_hooks_1 = require("../interact/skill_hooks");
const event_rule_registry_1 = require("../events/event_rule_registry");
class BangLimiter {
    static canPlayBang(stateOrPlayer, playerOrCount, stateArg) {
        const state = "bangCountThisTurn" in stateOrPlayer ? stateOrPlayer : stateArg;
        const player = "bangCountThisTurn" in stateOrPlayer
            ? playerOrCount
            : stateOrPlayer;
        const bangCount = "bangCountThisTurn" in stateOrPlayer
            ? stateOrPlayer.bangCountThisTurn
            : playerOrCount;
        const eventLimit = event_rule_registry_1.EventRuleRegistry.getBangLimit(state, player, 1);
        if (eventLimit <= 0) {
            return false;
        }
        if (skill_hooks_1.SkillHooks.hasSkill(player, "Willy the Kid", state)) {
            return true;
        }
        const turnPlayer = state ? state.players.get(state.turnPlayerId) : undefined;
        if (player.equipments.weapon?.name === "VOLCANIC" &&
            skill_hooks_1.SkillHooks.isEquipmentEffective(player, turnPlayer, state)) {
            return true;
        }
        return bangCount < eventLimit;
    }
}
exports.BangLimiter = BangLimiter;
