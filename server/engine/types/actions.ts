export type CommandType =
  | "SELECT_CHARACTERS"
  | "RESOLVE_TURN_START"
  | "RESOLVE_PHASE_1"
  | "PLAY_CARD"
  | "ACTIVATE_GREEN_CARD"
  | "DISCARD_CARD"
  | "END_TURN"
  | "USE_ACTIVE_SKILL"
  | "RESOLVE_REACTION"
  | "SELECT_STOLEN_CARD";

export interface TargetSelectionEntry {
  targetPlayerId: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
}

export interface PlayerCommand {
  playerId: string;
  type: CommandType;
  cardId?: string;
  greenCardId?: string;
  characterIds?: string[];
  targetPlayerId?: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
  discardCardIds?: string[];
  targetSelections?: TargetSelectionEntry[];
  payload?: any;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  events?: DomainEvent[];
}

export interface DomainEvent {
  type: string;
  payload: any;
  timestamp: number;
  visibleTo?: string[];
  maskedPayload?: any;
}
