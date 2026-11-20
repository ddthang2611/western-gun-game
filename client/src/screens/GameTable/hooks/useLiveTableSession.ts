import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Card,
  Character,
  EquipmentSlot,
  GameOverInfo,
  GreenCard,
  Player,
  TableState,
} from "../../../types/game";
import { useGameSocket } from "../../../hooks/useGameSocket";
import type { GameEventMessage } from "../utils/gameEventChoreography";
import { EMPTY_LIVE_TABLE } from "../utils/tableSelectors";

export interface UseLiveTableSessionParams {
  enabled: boolean;
  onHandReconcile: (hand: Card[]) => void;
  onNewHandCards?: (cardIds: string[]) => void;
  onGameEvent: (event: GameEventMessage) => void;
  onBackToLobby?: () => void;
  onKicked?: (reason: string) => void;
  showError: (message: string) => void;
}

type TableStateSnapshotPayload = Partial<TableState> & {
  myHand?: Card[];
  myHp?: number;
  myMaxHp?: number;
  myEquipments?: EquipmentSlot;
  myGreenCards?: GreenCard[];
  myJudgements?: { hasJail: boolean; hasDynamite: boolean };
};

// Synchronize live multiplayer WebSocket table state
export function useLiveTableSession({
  enabled,
  onHandReconcile,
  onNewHandCards,
  onGameEvent,
  onBackToLobby,
  onKicked,
  showError,
}: UseLiveTableSessionParams) {
  const { isConnected, sendMessage, subscribe } = useGameSocket();

  const [state, setState] = useState<TableState>(EMPTY_LIVE_TABLE);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [myHeroes] = useState<Character[]>([]);
  const [myHp, setMyHp] = useState(4);
  const [myMaxHp, setMyMaxHp] = useState(4);
  const [myEquipments, setMyEquipments] = useState<EquipmentSlot>({});
  const [myGreenCards, setMyGreenCards] = useState<GreenCard[]>([]);
  const [myJudgements, setMyJudgements] = useState({
    hasJail: false,
    hasDynamite: false,
  });

  const hasReceivedTableStateRef = useRef(false);
  const hasInitialHandRef = useRef(false);
  const prevHandRef = useRef<Card[]>([]);
  const stateSeqRef = useRef<number | undefined>(undefined);
  const cmdSeqRef = useRef(0);
  const myPlayerIdRef = useRef("");
  const playersRef = useRef<Player[]>([]);

  const onHandReconcileRef = useRef(onHandReconcile);
  const onNewHandCardsRef = useRef(onNewHandCards);
  const onGameEventRef = useRef(onGameEvent);
  const onBackToLobbyRef = useRef(onBackToLobby);
  const onKickedRef = useRef(onKicked);
  const showErrorRef = useRef(showError);

  useEffect(() => {
    onHandReconcileRef.current = onHandReconcile;
    onNewHandCardsRef.current = onNewHandCards;
    onGameEventRef.current = onGameEvent;
    onBackToLobbyRef.current = onBackToLobby;
    onKickedRef.current = onKicked;
    showErrorRef.current = showError;
  }, [onHandReconcile, onNewHandCards, onGameEvent, onBackToLobby, onKicked, showError]);

  useEffect(() => {
    myPlayerIdRef.current = state.myPlayerId;
  }, [state.myPlayerId]);

  useEffect(() => {
    playersRef.current = state.players;
  }, [state.players]);

  useEffect(() => {
    stateSeqRef.current = state.stateSeq;
  }, [state.stateSeq]);

  // Restore game session on connect/reconnect
  useEffect(() => {
    if (!enabled) return;
    if (!isConnected) {
      hasReceivedTableStateRef.current = false;
      return;
    }
    hasReceivedTableStateRef.current = false;
    sendMessage("RESTORE_SESSION", {});
  }, [enabled, isConnected, sendMessage]);

  useEffect(() => {
    if (!enabled) return;

    const applyTableSnapshot = (payload: TableStateSnapshotPayload | undefined) => {
      if (!payload) return;
      if (typeof payload.stateSeq === "number") {
        stateSeqRef.current = payload.stateSeq;
      }
      if (payload.matchPhase && payload.matchPhase !== "PLAYING") {
        hasInitialHandRef.current = false;
        prevHandRef.current = [];
      }
      setState((prev) => ({ ...prev, ...payload }));
      if (Array.isArray(payload.myHand)) {
        const incoming = payload.myHand;
        const prev = prevHandRef.current;
        const prevIds = new Set(prev.map((c) => c.id));
        const kept = prev
          .map((oldCard) => incoming.find((c) => c.id === oldCard.id))
          .filter((c): c is Card => Boolean(c));
        const added = incoming.filter((c) => !prevIds.has(c.id));
        const orderedHand = prev.length > 0 ? [...kept, ...added] : incoming;

        if (!hasInitialHandRef.current) {
          if (orderedHand.length > 0 || payload.matchPhase === "PLAYING") {
            hasInitialHandRef.current = true;
          }
        } else if (added.length > 0) {
          onNewHandCardsRef.current?.(added.map((c) => c.id));
        }

        prevHandRef.current = orderedHand;
        setMyHand(orderedHand);
        onHandReconcileRef.current(orderedHand);
      }
      if (payload.myHp !== undefined) setMyHp(payload.myHp);
      if (payload.myMaxHp !== undefined) setMyMaxHp(payload.myMaxHp);
      if (payload.myEquipments) setMyEquipments(payload.myEquipments);
      if (payload.myGreenCards) setMyGreenCards(payload.myGreenCards);
      if (payload.myJudgements) setMyJudgements(payload.myJudgements);
    };

    const unsubscribe = subscribe((msg) => {
      const p = msg.payload;
      switch (msg.type) {
        case "AUTH_SUCCESS":
          return;

        case "AUTH_REQUIRED": {
          const reason =
            typeof p?.reason === "string"
              ? p.reason
              : "Session expired. Please sign in again.";
          if (onKickedRef.current) {
            onKickedRef.current(reason);
          } else {
            onBackToLobbyRef.current?.();
          }
          return;
        }

        case "TABLE_STATE": {
          hasReceivedTableStateRef.current = true;
          applyTableSnapshot(p as unknown as TableStateSnapshotPayload);
          return;
        }

        case "GAME_STATE": {
          // Fallback only before TABLE_STATE arrives
          if (!hasReceivedTableStateRef.current) {
            applyTableSnapshot(p as unknown as TableStateSnapshotPayload);
          }
          return;
        }

        case "GAME_EVENT": {
          if (p) {
            onGameEventRef.current(p as unknown as GameEventMessage);
          }
          return;
        }

        case "COMBAT_LOG_UPDATE": {
          if (Array.isArray(p?.combatLog)) {
            const nextLogs = p.combatLog as string[];
            setState((prev) => ({ ...prev, combatLog: nextLogs }));
          }
          return;
        }

        case "COMBAT_LOG": {
          if (typeof p?.text === "string" && p.text) {
            const text = p.text;
            setState((prev) => ({
              ...prev,
              combatLog: [text, ...prev.combatLog],
            }));
          }
          return;
        }

        case "GAME_OVER": {
          if (p) {
            setState((prev) => ({
              ...prev,
              gameOver: p as unknown as GameOverInfo,
            }));
          }
          return;
        }

        case "PLAYER_KICKED": {
          const reason =
            typeof p?.reason === "string"
              ? p.reason
              : "You were removed from the room by the Host.";
          fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          if (onKickedRef.current) {
            onKickedRef.current(reason);
          } else {
            onBackToLobbyRef.current?.();
          }
          return;
        }

        case "ERROR": {
          const message =
            typeof p?.message === "string" ? p.message : "Action failed.";
          showErrorRef.current(message);
          return;
        }

        case "LOBBY_STATE": {
          if (p?.status === "waiting") {
            onBackToLobbyRef.current?.();
          }
          return;
        }

        default:
          return;
      }
    });

    return unsubscribe;
  }, [enabled, subscribe]);

  const sendLiveCommand = useCallback(
    (type: string, payload: Record<string, unknown> = {}): boolean => {
      if (!isConnected) {
        showErrorRef.current("WebSocket connection is not ready.");
        return false;
      }
      cmdSeqRef.current += 1;
      const commandId = `cmd_${Date.now()}_${cmdSeqRef.current}`;
      const expectedSeq = stateSeqRef.current;
      const enrichedPayload: Record<string, unknown> = {
        ...payload,
        commandId,
        ...(typeof expectedSeq === "number" ? { expectedStateSeq: expectedSeq } : {}),
      };
      const sent = sendMessage(type, enrichedPayload);
      if (!sent) {
        showErrorRef.current("WebSocket connection is not ready.");
      }
      return sent;
    },
    [isConnected, sendMessage]
  );

  const sendLobbyReset = useCallback(() => {
    if (!sendMessage("RESET_LOBBY", {})) {
      onBackToLobbyRef.current?.();
    }
  }, [sendMessage]);

  const recordDiscardReveal = useCallback((card: Card) => {
    setState((prev) => ({
      ...prev,
      discardCount: prev.discardCount + 1,
      topDiscard: card,
    }));
  }, []);

  const getMyPlayerId = useCallback(() => myPlayerIdRef.current, []);
  const getPlayers = useCallback(() => playersRef.current, []);

  return {
    state,
    myHand,
    myHeroes,
    myHp,
    myMaxHp,
    myEquipments,
    myGreenCards,
    myJudgements,
    isWsConnected: isConnected,
    sendLiveCommand,
    sendLobbyReset,
    recordDiscardReveal,
    getMyPlayerId,
    getPlayers,
  };
}
