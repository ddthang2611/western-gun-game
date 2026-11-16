import { EnginePlayer, SimulationState } from "../types/state";

export class SeatManager {
  // Resolve state and player map
  private static unpack(stateOrPlayers: SimulationState | Map<string, EnginePlayer>): {
    state?: SimulationState;
    players: Map<string, EnginePlayer>;
  } {
    if (stateOrPlayers instanceof Map) {
      return { players: stateOrPlayers };
    }
    return { state: stateOrPlayers, players: stateOrPlayers.players };
  }

  // Active players sorted by seat
  public static getAlivePlayers(
    state: SimulationState,
    includeGhosts?: boolean
  ): EnginePlayer[];
  public static getAlivePlayers(
    players: Map<string, EnginePlayer>,
    includeGhosts?: boolean
  ): EnginePlayer[];
  public static getAlivePlayers(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    includeGhosts: boolean = true
  ): EnginePlayer[] {
    const { players } = this.unpack(stateOrPlayers);
    return Array.from(players.values())
      .filter((p) => !p.isDead && (includeGhosts || !p.isGhost))
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }

  // Non-ghost living players for wins
  public static getLivingContenders(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>
  ): EnginePlayer[] {
    return this.getAlivePlayers(stateOrPlayers as Map<string, EnginePlayer>, false);
  }

  // Next eligible player in turn order
  public static getNextTurnPlayer(
    state: SimulationState,
    currentPlayerId: string
  ): EnginePlayer | undefined;
  public static getNextTurnPlayer(
    players: Map<string, EnginePlayer>,
    currentPlayerId: string
  ): EnginePlayer;
  public static getNextTurnPlayer(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    currentPlayerId: string
  ): EnginePlayer | undefined {
    const { state, players } = this.unpack(stateOrPlayers);
    const allSeats = Array.from(players.values()).sort((a, b) => a.seatIndex - b.seatIndex);

    if (allSeats.length === 0) {
      if (!state) throw new Error("No alive players left on the board.");
      return undefined;
    }

    const isEligible = (p: EnginePlayer): boolean => {
      if (!p.isDead) return true;
      const code = state?.activeEvent?.effectCode;
      if (code === "EVENT_HN_GHOST_TOWN") return true;
      if (code === "EVENT_FOC_DEAD_MAN" && state?.firstEliminatedPlayerId === p.id) return true;
      return false;
    };

    const currentIndex = allSeats.findIndex((p) => p.id === currentPlayerId);
    if (currentIndex === -1) {
      const first = allSeats.find(isEligible);
      if (!first && !state) throw new Error("No alive players left on the board.");
      return first;
    }

    const step = state?.direction === -1 ? -1 : 1;
    const total = allSeats.length;

    for (let offset = 1; offset <= total; offset++) {
      const idx = (((currentIndex + offset * step) % total) + total) % total;
      if (isEligible(allSeats[idx])) {
        return allSeats[idx];
      }
    }

    if (!state) throw new Error("No alive players left on the board.");
    return undefined;
  }

  // Traverse alive seats in turn direction
  public static getClockwisePlayers(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    originPlayerId: string,
    includeOrigin: boolean = false
  ): EnginePlayer[] {
    const { state, players } = this.unpack(stateOrPlayers);
    const alive = this.getAlivePlayers(players, true);
    if (alive.length === 0) return [];

    const step = state?.direction === -1 ? -1 : 1;
    let startIndex = alive.findIndex((p) => p.id === originPlayerId);

    if (startIndex === -1) {
      const origin = players.get(originPlayerId);
      if (origin) {
        if (step === 1) {
          startIndex = alive.findIndex((p) => p.seatIndex > origin.seatIndex);
        } else {
          for (let i = alive.length - 1; i >= 0; i--) {
            if (alive[i].seatIndex < origin.seatIndex) {
              startIndex = i;
              break;
            }
          }
        }
      }
      if (startIndex === -1) startIndex = step === 1 ? 0 : alive.length - 1;
    }

    const ordered: EnginePlayer[] = [];
    const count = alive.length;

    for (let i = 0; i < count; i++) {
      const idx = (((startIndex + i * step) % count) + count) % count;
      const candidate = alive[idx];
      if (!includeOrigin && candidate.id === originPlayerId) continue;
      ordered.push(candidate);
    }

    return ordered;
  }

  // Next living player for Dynamite
  public static getPlayerOnLeft(
    stateOrPlayers: SimulationState | Map<string, EnginePlayer>,
    currentPlayerId: string
  ): EnginePlayer {
    const { state, players } = this.unpack(stateOrPlayers);
    const alive = this.getAlivePlayers(players, true);
    if (alive.length === 0) {
      throw new Error("No alive players left on the board.");
    }

    const currentIndex = alive.findIndex((p) => p.id === currentPlayerId);
    if (currentIndex === -1) return alive[0];

    const step = state?.direction === -1 ? -1 : 1;
    const nextIndex = (((currentIndex + step) % alive.length) + alive.length) % alive.length;
    return alive[nextIndex];
  }
}
