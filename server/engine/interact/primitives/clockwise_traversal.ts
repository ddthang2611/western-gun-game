import { EnginePlayer, SimulationState } from "../../types/state";
import { SeatManager } from "../../board/seat_manager";
import { AoeScope } from "../interact_types";

export class ClockwiseTraversal {
  // Ordered living seats by scope
  public static getTraversalList(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    originPlayerId: string,
    scope: AoeScope = "ALL_OTHERS",
    customFilter?: (player: EnginePlayer) => boolean
  ): EnginePlayer[] {
    const includeOrigin = scope !== "ALL_OTHERS";
    let result = SeatManager.getClockwisePlayers(
      stateOrPlayers as SimulationState,
      originPlayerId,
      includeOrigin
    );

    if (customFilter) {
      result = result.filter(customFilter);
    }

    return result;
  }
}
