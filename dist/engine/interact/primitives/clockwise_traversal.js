"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClockwiseTraversal = void 0;
const seat_manager_1 = require("../../board/seat_manager");
class ClockwiseTraversal {
    // Ordered living seats by scope
    static getTraversalList(stateOrPlayers, originPlayerId, scope = "ALL_OTHERS", customFilter) {
        const includeOrigin = scope !== "ALL_OTHERS";
        let result = seat_manager_1.SeatManager.getClockwisePlayers(stateOrPlayers, originPlayerId, includeOrigin);
        if (customFilter) {
            result = result.filter(customFilter);
        }
        return result;
    }
}
exports.ClockwiseTraversal = ClockwiseTraversal;
