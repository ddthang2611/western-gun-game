import { EngineCard } from "../types/cards";
import { PlayerCommand } from "../types/actions";
import { SanitizedGameState, SanitizedPlayerState } from "../state/fog_of_war";
import { RoleType } from "../types/state";

export type BotDifficulty = "normal" | "hard";

export interface BotRoleBelief {
  deputy: number;
  outlaw: number;
  renegade: number;
}

export interface BotTurnMemory {
  turnKey: string;
  lastStateSeq: number;
  actionsTaken: number;
  docHolydayUsed: number;
  joseDelgadoUsed: number;
  rejectedSignatures: Set<string>;
}

export interface BotActionCandidate {
  command: PlayerCommand;
  score: number;
  reason: string;
  signature: string;
}

export interface BotDecisionContext {
  botId: string;
  difficulty: BotDifficulty;
  snapshot: SanitizedGameState;
  me: SanitizedPlayerState;
  myRole: RoleType;
  hand: EngineCard[];
  alivePlayers: SanitizedPlayerState[];
  beliefs: Map<string, BotRoleBelief>;
  swingScores: Map<string, number>;
  turnMemory: BotTurnMemory;
  preferredPeyoteColor: "RED" | "BLACK";
}

export interface InPlayCardEntry {
  area: "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  card: EngineCard;
  isDelay?: boolean;
  greenEntryId?: string;
}

export const BOT_MAX_ACTIONS_PER_TURN = 16;
