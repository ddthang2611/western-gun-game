import { EnginePlayer, RoleType, SimulationState } from "../types/state";
import { SeatManager } from "../board/seat_manager";

export type WinningFaction = "SHERIFF_AND_DEPUTIES" | "OUTLAWS" | "RENEGADE" | RoleType | null;

export interface WinEvaluationResult {
  gameOver: boolean;
  winner: WinningFaction;
  message?: string;
  outcomeCode?: string;
  outcomeParams?: Record<string, string | number | null>;
}

export class WinConditionEvaluator {
  // Check 3-player circular target rule
  private static is3PlayerQuarryKill(killerRole: RoleType, victimRole: RoleType): boolean {
    return (
      (killerRole === "deputy" && victimRole === "renegade") ||
      (killerRole === "renegade" && victimRole === "outlaw") ||
      (killerRole === "outlaw" && victimRole === "deputy")
    );
  }

  // Evaluate victory conditions
  public static evaluate(
    state: SimulationState,
    lastKill?: { killerId?: string; victimRole?: RoleType }
  ): WinEvaluationResult;
  public static evaluate(players: Map<string, EnginePlayer>): WinEvaluationResult;
  public static evaluate(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    lastKill?: { killerId?: string; victimRole?: RoleType }
  ): WinEvaluationResult {
    const state = stateOrPlayers instanceof Map ? undefined : stateOrPlayers;

    if (state?.gameOver) {
      return {
        gameOver: true,
        winner: state.gameOver.winner as WinningFaction,
        message: state.gameOver.message,
        outcomeCode: state.gameOver.outcomeCode,
        outcomeParams: state.gameOver.outcomeParams,
      };
    }

    const contenders = SeatManager.getLivingContenders(stateOrPlayers as Map<string, EnginePlayer>);

    // 3-Player public circular victory
    if (state?.is3PlayerVariant) {
      if (lastKill?.killerId && lastKill.victimRole) {
        const killer = state.players.get(lastKill.killerId);
        if (
          killer &&
          !killer.isDead &&
          !killer.isGhost &&
          this.is3PlayerQuarryKill(killer.role, lastKill.victimRole)
        ) {
          return {
            gameOver: true,
            winner: killer.role,
            outcomeCode: "OUTCOME_3P_TARGET_KILL",
            outcomeParams: {
              killerName: killer.name,
              killerRole: killer.role,
              victimRole: lastKill.victimRole,
            },
            message: `Game over! ${killer.name} (${killer.role}) eliminated their target (${lastKill.victimRole}) and wins!`,
          };
        }
      }

      if (contenders.length === 1) {
        const survivor = contenders[0];
        return {
          gameOver: true,
          winner: survivor.role,
          outcomeCode: "OUTCOME_3P_LAST_SURVIVOR",
          outcomeParams: {
            survivorName: survivor.name,
            survivorRole: survivor.role,
          },
          message: `Game over! ${survivor.name} (${survivor.role}) is the last survivor and wins!`,
        };
      }

      if (contenders.length === 0) {
        return {
          gameOver: true,
          winner: null,
          outcomeCode: "OUTCOME_NO_SURVIVORS",
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
          outcomeCode: "OUTCOME_RENEGADE_WIN",
          message: "The lone Renegade eliminated the Sheriff in a final standoff and wins!",
        };
      }

      return {
        gameOver: true,
        winner: "OUTLAWS",
        outcomeCode: "OUTCOME_OUTLAWS_WIN",
        message: "The Sheriff has been killed. The Outlaws win!",
      };
    }

    if (outlawsAlive === 0 && renegadesAlive === 0) {
      return {
        gameOver: true,
        winner: "SHERIFF_AND_DEPUTIES",
        outcomeCode: "OUTCOME_SHERIFF_AND_DEPUTIES_WIN",
        message: "All Outlaws and Renegades have been eliminated. Law and Order prevails!",
      };
    }

    return { gameOver: false, winner: null };
  }
}
