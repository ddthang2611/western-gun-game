import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { wsClient, type WsListener } from "../services/wsClient";

export interface GameSocketContextValue {
  isConnected: boolean;
  sendMessage: (type: string, payload?: Record<string, unknown>) => boolean;
  subscribe: (listener: WsListener) => () => void;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

const NOOP_FALLBACK: GameSocketContextValue = {
  isConnected: false,
  sendMessage: () => false,
  subscribe: () => () => undefined,
  connectSocket: () => undefined,
  disconnectSocket: () => undefined,
};

const GameSocketContext = createContext<GameSocketContextValue | null>(null);

export const GameSocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(() => wsClient.isConnected());

  useEffect(() => {
    const unsubscribeStatus = wsClient.subscribeStatus(setIsConnected);
    // Defer connect past StrictMode mount cycle
    const connectTimer = window.setTimeout(() => {
      wsClient.connectSocket();
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
      unsubscribeStatus();
      wsClient.disconnectSocket();
    };
  }, []);

  const sendMessage = useCallback(
    (type: string, payload: Record<string, unknown> = {}) =>
      wsClient.sendMessage(type, payload),
    []
  );

  const subscribe = useCallback(
    (listener: WsListener) => wsClient.subscribe(listener),
    []
  );

  const connectSocket = useCallback(() => wsClient.connectSocket(), []);
  const disconnectSocket = useCallback(() => wsClient.disconnectSocket(), []);

  const value = useMemo<GameSocketContextValue>(
    () => ({
      isConnected,
      sendMessage,
      subscribe,
      connectSocket,
      disconnectSocket,
    }),
    [isConnected, sendMessage, subscribe, connectSocket, disconnectSocket]
  );

  return (
    <GameSocketContext.Provider value={value}>
      {children}
    </GameSocketContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useGameSocket(): GameSocketContextValue {
  const ctx = useContext(GameSocketContext);
  return ctx ?? NOOP_FALLBACK;
}
