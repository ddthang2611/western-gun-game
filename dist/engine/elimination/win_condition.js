"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WinConditionEvaluator = void 0;
const seat_manager_1 = require("../board/seat_manager");
class WinConditionEvaluator {
    // Check 3-player circular target rule
    static is3PlayerQuarryKill(killerRole, victimRole) {
        return ((killerRole === "deputy" && victimRole === "renegade") ||
            (killerRole === "renegade" && victimRole === "outlaw") ||
            (killerRole === "outlaw" && victimRole === "deputy"));
    }
    static evaluate(stateOrPlayers, lastKill) {
        const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;
        if (state?.gameOver?.winner) {
            return {
                gameOver: true,
                winner: state.gameOver.winner,
                message: state.gameOver.message,
            };
        }
        const contenders = seat_manager_1.SeatManager.getLivingContenders(stateOrPlayers);
        // 3-Player public circular victory
        if (state?.is3PlayerVariant) {
            if (lastKill?.killerId && lastKill.victimRole) {
                const killer = state.players.get(lastKill.killerId);
                if (killer &&
                    !killer.isDead &&
                    !killer.isGhost &&
                    this.is3PlayerQuarryKill(killer.role, lastKill.victimRole)) {
                    return {
                        gameOver: true,
                        winner: killer.role,
                        message: `Game over! ${killer.name} (${killer.role}) eliminated their target (${lastKill.victimRole}) and wins!`,
                    };
                }
            }
            if (contenders.length === 1) {
                const survivor = contenders[0];
                return {
                    gameOver: true,
                    winner: survivor.role,
                    message: `Game over! ${survivor.name} (${survivor.role}) is the last survivor and wins!`,
                };
            }
            if (contenders.length === 0) {
                return {
                    gameOver: true,
                    winner: null,
                    message: "Game over! No survivors remain.",
                };
            }
            return { gameOver: false, winner: null };
        }
        // Standard 4 to 8 player rules
        const sheriffAlive = contenders.some((p) => p.role === "sheriff");
        const outlawsAlive = contenders.filter((p) => p.role === "outlaw").length;
        const renegadesAlive = contenders.filter((p) => p.role === "renegade").length;
        if (!sheriffAlive) {
            if (contenders.length === 1 && contenders[0].role === "renegade") {
                return {
                    gameOver: true,
                    winner: "RENEGADE",
                    message: "The lone Renegade eliminated the Sheriff in a final standoff and wins!",
                };
            }
            return {
                gameOver: true,
                winner: "OUTLAWS",
                message: "The Sheriff has been killed. The Outlaws win!",
            };
        }
        if (outlawsAlive === 0 && renegadesAlive === 0) {
            return {
                gameOver: true,
                winner: "SHERIFF_AND_DEPUTIES",
                message: "All Outlaws and Renegades have been eliminated. Law and Order prevails!",
            };
        }
        return { gameOver: false, winner: null };
    }
}
exports.WinConditionEvaluator = WinConditionEvaluator;
