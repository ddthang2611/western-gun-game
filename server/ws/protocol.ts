export type ClientMessageType =
  | "AUTH_JOIN"
  | "RESTORE_SESSION"
  | "CREATE_ROOM"
  | "JOIN_ROOM"
  | "LEAVE_ROOM"
  | "SET_READY"
  | "UPDATE_SETTINGS"
  | "KICK_PLAYER"
  | "START_GAME"
  | "RESET_LOBBY"
  | "SYNC_LOBBY"
  | "PING"
  | "GAME_COMMAND"
  | "SELECT_CHARACTERS"
  | "RESOLVE_TURN_START"
  | "RESOLVE_PHASE_1"
  | "PLAY_CARD"
  | "ACTIVATE_GREEN_CARD"
  | "DISCARD_CARD"
  | "RESOLVE_REACTION"
  | "END_TURN"
  | "USE_ACTIVE_SKILL"
  | "SELECT_STOLEN_CARD";

export type ServerMessageType =
  | "AUTH_SUCCESS"
  | "AUTH_REQUIRED"
  | "LOBBY_STATE"
  | "PLAYER_KICKED"
  | "ERROR"
  | "PONG"
  | "SYSTEM_ALERT"
  | "GAME_STARTED"
  | "WORLD_SNAPSHOT"
  | "TABLE_STATE"
  | "GAME_STATE"
  | "GAME_EVENT"
  | "COMBAT_LOG_UPDATE"
  | "GAME_ACTION_SUCCESS"
  | "GAME_OVER";

export interface GameSettings {
  dualCharacterEnabled: boolean;
  dualCharacterHpRule: "strict" | "balanced" | "juggernaut";
  expansions: string[];
}

export interface TargetSelectionPayload {
  targetPlayerId: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
}

export interface GameActionPayload {
  cardId?: string;
  greenCardId?: string;
  characterIds?: string[];
  targetPlayerId?: string;
  targetArea?: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT";
  targetCardId?: string;
  discardCardIds?: string[];
  targetSelections?: TargetSelectionPayload[];
  action?: string;
  choice?: string;
  guess?: "RED" | "BLACK";
  skip?: boolean;
  skillType?: string;
  skill?: string;
  payload?: any;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

export interface LobbyState {
  roomExists: boolean;
  roomId: string;
  roomName?: string;
  hostId: string;
  status: "waiting" | "in_game";
  players: LobbyPlayer[];
  settings: GameSettings;
  minPlayers: number;
  maxPlayers: number;
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: any;
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: any;
}
