import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  TableState,
  Player,
  Card,
  GreenCard,
  EquipmentSlot,
  Character,
  PendingReactionInfo,
  GeneralStoreInfo,
  GameOverInfo,
  InFlightCard,
} from "../../types/game";
import {
  CharacterSelectModal,
  CardPickerModal,
  DefenseModal,
  GeneralStoreModal,
  GameOverModal,
  InFlightChain,
  TurnPromptModal,
  type BlueCardInPlayItem,
  type CardPickerAction,
} from "../../components/game";
import {
  initialMockState,
  initialMyHand,
  initialMyHeroes,
  initialMyEquipments,
  initialMyGreenCards,
  mockCandidateHeroes,
} from "@data/mock/mockGameTable";
import { TableTopBar } from "./components/TableTopBar";
import { OpponentRing } from "./components/OpponentRing";
import { TableSidebar } from "./components/TableSidebar";
import { TableActionBar } from "./components/TableActionBar";
import { PlayerConsole } from "./components/PlayerConsole/PlayerConsole";
import { CombatLogModal } from "./components/CombatLogModal";
import { TargetingArrow } from "./components/TargetingArrow";
import "./GameTableScreen.scss";

export type DevForcedModalType =
  | "char_select"
  | "defense"
  | "card_picker"
  | "general_store"
  | "game_over"
  | "combat_log"
  | null;

export interface GameTableScreenProps {
  onBackToLobby?: () => void;
  onKicked?: (reason: string) => void;
  isMock?: boolean;
  externalHeroes?: Character[];
  candidateHeroesOverride?: Character[];
  forcedModal?: DevForcedModalType;
  onCloseForcedModal?: () => void;
  mockScenarioReaction?: PendingReactionInfo | null;
  mockScenarioGeneralStore?: GeneralStoreInfo | null;
  mockScenarioGameOver?: GameOverInfo | null;
}

interface VfxBeam {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  type: "bullet" | "heal" | "jail" | "dynamite" | "draw";
}

type SkillModeType =
  | "SID_KETCHUM_HEAL"
  | "CHUCK_WENGAM_SACRIFICE"
  | "JOSE_DELGADO_DRAW"
  | "DOC_HOLYDAY_BANG"
  | null;

const DISCARD_COST_CARDS = new Set([
  "SPRINGFIELD",
  "WHISKY",
  "RAG TIME",
  "TEQUILA",
  "BRAWL",
]);

const MANIPULATE_CARDS = new Set([
  "CAT BALOU",
  "CAN CAN",
  "PANIC!",
  "RAG TIME",
  "CONESTOGA",
]);

const TARGETED_SINGLE_CARDS = new Set([
  "BANG!",
  "PUNCH",
  "SPRINGFIELD",
  "DUEL",
  "JAIL",
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
]);

const TARGETED_GREEN_CARDS = new Set([
  "KNIFE",
  "DERRINGER",
  "PEPPERBOX",
  "BUFFALO RIFLE",
  "CAN CAN",
  "CONESTOGA",
]);

const GREEN_DEFENSE_NAMES = new Set([
  "BIBLE",
  "SOMBRERO",
  "IRON PLATE",
  "TEN GALLON HAT",
]);

const EMPTY_LIVE_TABLE: TableState = {
  roomId: "...",
  hostInfo: "Connecting...",
  roundNumber: 1,
  myPlayerId: "",
  players: [],
  activePlayerId: "",
  currentPhase: 0,
  deckCount: 0,
  discardCount: 0,
  inFlightCards: [],
  combatLog: [],
  roleCounts: { police: 0, outlaw: 0, renegade: 0 },
  myRole: undefined,
  myPendingReaction: null,
  pendingReactions: [],
  generalStore: null,
  gameOver: null,
  activeEvent: null,
  matchPaused: false,
};

function countInPlayCards(player: Player): number {
  const eq = player.equipments;
  const equipCount = [eq.weapon, eq.horseDef, eq.horseOff, eq.barrel, eq.extra].filter(Boolean).length;
  const judgementCount =
    player.judgements && player.judgements.length > 0
      ? player.judgements.length
      : (player.hasJail ? 1 : 0) + (player.hasDynamite ? 1 : 0);
  return equipCount + player.greenCards.length + judgementCount;
}

function countInspectableCards(player: Player): number {
  return player.handCount + countInPlayCards(player);
}

export const GameTableScreen: React.FC<GameTableScreenProps> = ({
  onBackToLobby,
  onKicked,
  isMock = true,
  externalHeroes,
  candidateHeroesOverride,
  forcedModal = null,
  onCloseForcedModal,
  mockScenarioReaction,
  mockScenarioGeneralStore,
  mockScenarioGameOver,
}) => {
  const [state, setState] = useState<TableState>(() =>
    isMock ? initialMockState : EMPTY_LIVE_TABLE
  );
  const [myHand, setMyHand] = useState<Card[]>(() => (isMock ? initialMyHand : []));
  const [myHeroes, setMyHeroes] = useState<Character[]>(() =>
    isMock ? externalHeroes || initialMyHeroes : []
  );
  const [myHp, setMyHp] = useState(() =>
    isMock && externalHeroes && externalHeroes.length > 0
      ? Math.min(...externalHeroes.map((h) => h.baseHp))
      : 4
  );
  const [myMaxHp, setMyMaxHp] = useState(() =>
    isMock && externalHeroes && externalHeroes.length > 0
      ? Math.min(...externalHeroes.map((h) => h.baseHp))
      : 4
  );
  const [myEquipments, setMyEquipments] = useState<EquipmentSlot>(() =>
    isMock ? initialMyEquipments : {}
  );
  const [myGreenCards, setMyGreenCards] = useState<GreenCard[]>(() =>
    isMock ? initialMyGreenCards : []
  );
  const [myJudgements, setMyJudgements] = useState({ hasJail: false, hasDynamite: false });

  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [selectedGreenCardId, setSelectedGreenCardId] = useState<string | null>(null);
  const [discardCostIds, setDiscardCostIds] = useState<string[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [skillMode, setSkillMode] = useState<SkillModeType>(null);
  const [skillDiscardIds, setSkillDiscardIds] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(isMock);
  const [vfxBeams, setVfxBeams] = useState<VfxBeam[]>([]);
  const [ephemeralCheckCards, setEphemeralCheckCards] = useState<InFlightCard[]>([]);

  const [showCharSelectModal, setShowCharSelectModal] = useState(false);
  const [isCombatLogModalOpen, setIsCombatLogModalOpen] = useState(false);
  const [cardPickerConfig, setCardPickerConfig] = useState<{
    isOpen: boolean;
    targetPlayer?: Player;
    action: CardPickerAction;
    cardName?: string;
    allowHand?: boolean;
    sourceGreenCardId?: string;
  }>({
    isOpen: false,
    action: "destroy",
  });

  const socketRef = useRef<WebSocket | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(!isMock);
  const connectWsRef = useRef<(() => void) | null>(null);
  const vfxTimersRef = useRef<number[]>([]);
  const vfxSeqRef = useRef(0);
  const onBackToLobbyRef = useRef(onBackToLobby);
  const onKickedRef = useRef(onKicked);
  const triggerVfxRef = useRef<
    ((type: VfxBeam["type"], targetId?: string, aoeHeal?: boolean) => void) | null
  >(null);

  useEffect(() => {
    onBackToLobbyRef.current = onBackToLobby;
    onKickedRef.current = onKicked;
  }, [onBackToLobby, onKicked]);

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      vfxTimersRef.current = vfxTimersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    vfxTimersRef.current.push(id);
  }, []);

  const showError = useCallback((message: string) => {
    setErrorNotice(message);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorNotice(null);
      errorTimerRef.current = null;
    }, 4000);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    clearReconnectTimer();
    const ws = socketRef.current;
    if (ws) {
      socketRef.current = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        // Defer close until handshake finishes
        ws.onopen = () => ws.close(1000);
      } else {
        ws.onopen = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000);
        }
      }
    }
  }, [clearReconnectTimer]);

  const sendWsMessage = useCallback(
    (type: string, payload: Record<string, unknown> = {}): boolean => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        showError("WebSocket connection is not ready.");
        return false;
      }
      ws.send(JSON.stringify({ type, payload }));
      return true;
    },
    [showError]
  );

  const connectServerWebSocket = useCallback(() => {
    closeSocket();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "AUTH_SUCCESS") {
            return;
          }

          if (msg.type === "GAME_STATE" || msg.type === "TABLE_STATE") {
            const payload = msg.payload || {};
            setState((prev) => ({ ...prev, ...payload }));
            if (Array.isArray(payload.myHand)) {
              setMyHand(payload.myHand);
              setSelectedHandCardId((prevId) =>
                prevId && payload.myHand.some((c: Card) => c.id === prevId) ? prevId : null
              );
              setDiscardCostIds((prevIds) =>
                prevIds.filter((id) => payload.myHand.some((c: Card) => c.id === id))
              );
              setSkillDiscardIds((prevIds) =>
                prevIds.filter((id) => payload.myHand.some((c: Card) => c.id === id))
              );
            }
            if (payload.myHp !== undefined) setMyHp(payload.myHp);
            if (payload.myMaxHp !== undefined) setMyMaxHp(payload.myMaxHp);
            if (payload.myEquipments) setMyEquipments(payload.myEquipments);
            if (payload.myGreenCards) setMyGreenCards(payload.myGreenCards);
            if (payload.myJudgements) setMyJudgements(payload.myJudgements);
          } else if (msg.type === "COMBAT_LOG_UPDATE" && msg.payload?.combatLog) {
            setState((prev) => ({
              ...prev,
              combatLog: msg.payload.combatLog,
            }));
          } else if (msg.type === "COMBAT_LOG" && msg.payload?.text) {
            setState((prev) => ({
              ...prev,
              combatLog: [msg.payload.text, ...prev.combatLog],
            }));
          } else if (msg.type === "GAME_EVENT" && msg.payload) {
            const ev = msg.payload;
            const p = ev.payload || {};
            if (
              ev.type === "BANG_ATTACK_LAUNCHED" ||
              ev.type === "PUNCH_LAUNCHED" ||
              ev.type === "SPRINGFIELD_LAUNCHED" ||
              ev.type === "AOE_GATLING_TRIGGERED" ||
              ev.type === "AOE_INDIANS_TRIGGERED"
            ) {
              triggerVfxRef.current?.("bullet", p.targetId);
            } else if (
              ev.type === "HEAL_RESOLVED" ||
              ev.type === "FATAL_DAMAGE_REVIVED_WITH_BEER"
            ) {
              triggerVfxRef.current?.("heal", p.playerId, false);
            } else if (ev.type === "SALOON_HEALED") {
              triggerVfxRef.current?.("heal", undefined, true);
            } else if (ev.type === "JAIL_ATTACHED") {
              triggerVfxRef.current?.("jail", p.targetPlayerId);
            } else if (ev.type === "DYNAMITE_ATTACHED" || ev.type === "DYNAMITE_EXPLODED") {
              triggerVfxRef.current?.("dynamite", p.playerId);
            } else if (ev.type === "PHASE_CHANGED" && p.phase === 1) {
              triggerVfxRef.current?.("draw");
            } else if (ev.type === "DRAW_CHECK_RESULT") {
              if (p.reason === "DYNAMITE" || p.reason === "JAIL") {
                return;
              }
              const rawCard = p.chosenCard || (Array.isArray(p.drawnCards) ? p.drawnCards[0] : null);
              if (rawCard) {
                const entries: InFlightCard[] = [];
                if (p.reason) {
                  const reasonUpper = String(p.reason).toUpperCase();
                  const reasonSlug = reasonUpper.toLowerCase().replace(/[^a-z0-9]/g, "_");
                  const isJourdonnais = reasonUpper === "JOURDONNAIS";
                  const actor = state.players.find((pl) => pl.id === p.playerId);
                  const sourceCard: Card = {
                    id: `src_${reasonSlug}_${Date.now()}_${Math.random()}`,
                    name: reasonUpper,
                    rank: "Q",
                    suit: "spades",
                    border: reasonUpper === "BARREL" || isJourdonnais ? "blue" : "green",
                    image: isJourdonnais
                      ? actor?.characters?.[0]?.image || "/assets/images/cards/card_barrel.png"
                      : `/assets/images/cards/card_${reasonSlug}.png`,
                    desc: `Draw check for ${reasonUpper}.`,
                  };
                  entries.push({
                    id: `inf_src_${Date.now()}_${Math.random()}`,
                    card: sourceCard,
                    sourcePlayerName: p.playerName || "Player",
                    actionText: isJourdonnais ? "Jourdonnais Check" : `${reasonUpper} Check`,
                  });
                }

                const clientCard: Card = {
                  id: rawCard.id || `chk_${Date.now()}`,
                  name: rawCard.name || (p.reason ? `${p.reason} CHECK` : "DRAW CHECK"),
                  suit: rawCard.suit,
                  rank: rawCard.rank,
                  border: rawCard.border || "blue",
                  image: rawCard.image || `/assets/images/cards/card_${String(rawCard.name || "barrel").toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`,
                  desc: `${p.playerName} draw check for ${p.reason || "action"}.`,
                };
                const outcomeText = p.success ? "PASSED" : "FAILED";
                const sourceTag = p.reason === "JOURDONNAIS" ? "Jourdonnais" : "Flipped";
                entries.push({
                  id: `chk_${Date.now()}_${Math.random()}`,
                  card: clientCard,
                  sourcePlayerName: `${p.playerName} (${sourceTag})`,
                  actionText: `${rawCard.rank} of ${rawCard.suit} (${outcomeText})`,
                });

                const entryIds = new Set(entries.map((e) => e.id));
                setEphemeralCheckCards((prev) => [...prev, ...entries]);
                scheduleTimeout(() => {
                  setEphemeralCheckCards((prev) => prev.filter((c) => !entryIds.has(c.id)));
                  setState((prev) => ({
                    ...prev,
                    discardCount: prev.discardCount + 1,
                    topDiscard: clientCard,
                  }));
                }, 3000);
              }
            } else if (ev.type === "JUDGEMENT_RESOLVED") {
              const rawCard = p.drawnCard;
              if (rawCard) {
                const isExploded = p.result === "EXPLODED";
                const isEscaped = p.result === "ESCAPED";
                const jType = String(p.judgementType || "DYNAMITE").toUpperCase();
                const rawSource = p.judgementCard;
                const sourceCard: Card = rawSource
                  ? {
                      id: rawSource.id || `src_judge_${Date.now()}`,
                      name: rawSource.name || jType,
                      suit: rawSource.suit,
                      rank: rawSource.rank,
                      border: rawSource.border || "blue",
                      image: rawSource.image || `/assets/images/cards/card_${jType.toLowerCase()}.png`,
                      desc: rawSource.desc || `${jType} judgement.`,
                    }
                  : {
                      id: `src_judge_${Date.now()}`,
                      name: jType,
                      rank: jType === "DYNAMITE" ? "2" : "J",
                      suit: jType === "DYNAMITE" ? "hearts" : "spades",
                      border: "blue",
                      image: `/assets/images/cards/card_${jType.toLowerCase()}.png`,
                      desc: `${jType} judgement.`,
                    };
                const sourceEntry: InFlightCard = {
                  id: `inf_jsrc_${Date.now()}_${Math.random()}`,
                  card: sourceCard,
                  sourcePlayerName: p.playerName || "Player",
                  actionText: `${jType} Judgement`,
                };

                const clientCard: Card = {
                  id: rawCard.id || `judge_${Date.now()}`,
                  name: rawCard.name || `${jType} CHECK`,
                  suit: rawCard.suit,
                  rank: rawCard.rank,
                  border: rawCard.border || "blue",
                  image: rawCard.image || `/assets/images/cards/card_${String(rawCard.name || "dynamite").toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`,
                  desc: `${p.playerName} ${jType} result: ${p.result}`,
                };
                const checkEntry: InFlightCard = {
                  id: `judge_${Date.now()}_${Math.random()}`,
                  card: clientCard,
                  sourcePlayerName: `${p.playerName} (Flipped)`,
                  actionText: `${rawCard.rank} of ${rawCard.suit} — ${p.result}`,
                };

                const entryIds = new Set([sourceEntry.id, checkEntry.id]);
                setEphemeralCheckCards((prev) => [...prev, sourceEntry, checkEntry]);
                if (isExploded) {
                  triggerVfxRef.current?.("dynamite", p.playerId);
                }
                scheduleTimeout(() => {
                  setEphemeralCheckCards((prev) => prev.filter((c) => !entryIds.has(c.id)));
                  if (isExploded || !isEscaped) {
                    setState((prev) => ({
                      ...prev,
                      discardCount: prev.discardCount + 1,
                      topDiscard: clientCard,
                    }));
                  }
                }, 3000);
              }
            } else if (ev.type === "CARD_PLAYED_TO_ARENA" && p.card) {
              const rawCard = p.card;
              const clientCard: Card = {
                id: rawCard.id || `arena_${Date.now()}`,
                name: rawCard.name || "CARD",
                suit: rawCard.suit || "spades",
                rank: rawCard.rank || "A",
                border: rawCard.border || "brown",
                image:
                  rawCard.image ||
                  `/assets/images/cards/card_${String(rawCard.name || "bang").toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`,
                desc: rawCard.desc || rawCard.name || "Card played",
              };
              const arenaEntry: InFlightCard = {
                id: `arena_${rawCard.id || Date.now()}_${Math.random()}`,
                card: clientCard,
                sourcePlayerName: p.playerName || "Player",
                targetPlayerName: p.targetPlayerName,
                actionText: p.targetPlayerName
                  ? `${clientCard.name} -> ${p.targetPlayerName}`
                  : clientCard.name,
              };
              setEphemeralCheckCards((prev) => [...prev, arenaEntry]);
              scheduleTimeout(() => {
                setEphemeralCheckCards((prev) => prev.filter((c) => c.id !== arenaEntry.id));
              }, 2500);
            } else if (ev.type === "EVENT_PEYOTE_GUESS" && p.card) {
              const rawCard = p.card;
              const clientCard: Card = {
                id: rawCard.id || `peyote_${Date.now()}`,
                name: rawCard.name || "PEYOTE",
                suit: rawCard.suit || "spades",
                rank: rawCard.rank || "A",
                border: rawCard.border || "brown",
                image: rawCard.image,
                desc: rawCard.desc || "Peyote draw",
              };
              const peyoteEntry: InFlightCard = {
                id: `peyote_${Date.now()}_${Math.random()}`,
                card: clientCard,
                sourcePlayerName: `${p.playerName || "Player"} (Peyote)`,
                actionText: `${rawCard.rank} of ${rawCard.suit} (${p.correct ? "CORRECT" : "WRONG"})`,
              };
              setEphemeralCheckCards((prev) => [...prev, peyoteEntry]);
              scheduleTimeout(() => {
                setEphemeralCheckCards((prev) => prev.filter((c) => c.id !== peyoteEntry.id));
              }, 3000);
            }
          } else if (msg.type === "GAME_OVER" && msg.payload) {
            setState((prev) => ({
              ...prev,
              gameOver: msg.payload,
            }));
          } else if (msg.type === "PLAYER_KICKED") {
            const reason = msg.payload?.reason || "You were removed from the room by the Host.";
            shouldReconnectRef.current = false;
            closeSocket();
            fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
            if (onKickedRef.current) {
              onKickedRef.current(reason);
            } else {
              onBackToLobbyRef.current?.();
            }
          } else if (msg.type === "ERROR") {
            showError(msg.payload?.message || "Action failed.");
          } else if (msg.type === "LOBBY_STATE" && msg.payload?.status === "waiting") {
            shouldReconnectRef.current = false;
            closeSocket();
            onBackToLobbyRef.current?.();
          }
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        if (shouldReconnectRef.current) {
          const delay = Math.min(5000, 1000 * Math.pow(2, reconnectAttemptRef.current));
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(() => {
            connectWsRef.current?.();
          }, delay);
        }
      };

      ws.onerror = () => {
        setIsWsConnected(false);
      };
    } catch {
      scheduleTimeout(() => showError("Unable to open WebSocket connection."), 0);
    }
  }, [closeSocket, scheduleTimeout, showError]);

  useEffect(() => {
    connectWsRef.current = connectServerWebSocket;
  }, [connectServerWebSocket]);

  useEffect(() => {
    let connectTimer: number | null = null;
    if (!isMock) {
      shouldReconnectRef.current = true;
      // Defer initial connect past StrictMode cleanup
      connectTimer = window.setTimeout(() => {
        connectServerWebSocket();
      }, 0);
    }
    return () => {
      if (connectTimer !== null) {
        window.clearTimeout(connectTimer);
      }
      shouldReconnectRef.current = false;
      closeSocket();
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
      vfxTimersRef.current.forEach((id) => window.clearTimeout(id));
      vfxTimersRef.current = [];
    };
  }, [isMock, connectServerWebSocket, closeSocket]);

  const opponents = state.players.filter((p) => p.id !== state.myPlayerId);
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const activeHeroes = isMock
    ? myHeroes.length > 0
      ? myHeroes
      : myPlayer?.characters || []
    : myPlayer?.characters || myHeroes;
  const copiedHero = !isMock ? state.myCopiedCharacter ?? myPlayer?.copiedCharacter ?? null : null;
  const effectiveSkillHeroes =
    copiedHero && !activeHeroes.some((h) => h.id === copiedHero.id)
      ? [...activeHeroes, copiedHero]
      : activeHeroes;
  const activeHp = isMock ? myHp : myPlayer?.hp ?? myHp;
  const activeMaxHp = isMock ? myMaxHp : myPlayer?.maxHp ?? myMaxHp;
  const activeHand = isMock ? myHand : myPlayer?.handCards ?? myHand;
  const activeEquipments = isMock ? myEquipments : myPlayer?.equipments || myEquipments;
  const activeGreenCards = isMock ? myGreenCards : myPlayer?.greenCards || myGreenCards;
  const activeJudgements =
    !isMock && myPlayer
      ? { hasJail: myPlayer.hasJail, hasDynamite: myPlayer.hasDynamite }
      : myJudgements;
  const isMyTurn = isMock || (Boolean(state.myPlayerId) && state.activePlayerId === state.myPlayerId);
  const isTurnLocked = !isMock && (Boolean(state.matchPaused) || !isWsConnected);
  const isActionLocked = isTurnLocked || (!isMock && (!isMyTurn || state.currentPhase !== 2));
  const activePlayerName = state.players.find((p) => p.id === state.activePlayerId)?.name;
  const handLimit = effectiveSkillHeroes.some((h) => h.name === "Sean Mallory") ? 10 : activeHp;
  const excessCardsCount = Math.max(0, activeHand.length - handLimit);
  const selectedCard = activeHand.find((c) => c.id === selectedHandCardId);
  const selectedGreenCard = activeGreenCards.find((g) => g.id === selectedGreenCardId);
  const requiresExtraDiscard = Boolean(
    selectedCard && DISCARD_COST_CARDS.has(selectedCard.name) && state.currentPhase !== 3
  );
  const isBangCardForMe = (card?: Card): boolean => {
    if (!card) return false;
    if (card.name === "BANG!") return true;
    return (
      card.name === "MISSED!" &&
      effectiveSkillHeroes.some((h) => h.name === "Calamity Janet")
    );
  };
  const isSniperActive = state.activeEvent?.effectCode === "EVENT_FOC_SNIPER";
  const isRicochetActive = state.activeEvent?.effectCode === "EVENT_FOC_RICOCHET";
  const isSniperBangSelected = Boolean(
    isSniperActive && selectedCard && isBangCardForMe(selectedCard) && state.currentPhase !== 3
  );
  const selectedTargetPlayer = selectedTargetId
    ? state.players.find((p) => p.id === selectedTargetId)
    : undefined;
  const canRicochetEquip = Boolean(
    isRicochetActive &&
      state.currentPhase === 2 &&
      selectedCard &&
      isBangCardForMe(selectedCard) &&
      selectedTargetPlayer &&
      countInPlayCards(selectedTargetPlayer) > 0
  );

  const triggerVfx = useCallback(
    (type: VfxBeam["type"], targetId?: string, aoeHeal = false) => {
      const centerEl = document.querySelector(".game-table__center-stage");
      const centerRect = centerEl?.getBoundingClientRect();
      const startX = centerRect ? centerRect.left + centerRect.width / 2 : window.innerWidth / 2 - 140;
      const startY = centerRect ? centerRect.top + centerRect.height / 2 : window.innerHeight * 0.42;

      const beams: VfxBeam[] = [];
      const colorMap = {
        bullet: "#ef4444",
        heal: "#22c55e",
        jail: "#3b82f6",
        dynamite: "#f97316",
        draw: "#fbbf24",
      };

      const nextBeamId = (suffix: string) => {
        vfxSeqRef.current += 1;
        return `vfx_${vfxSeqRef.current}_${suffix}`;
      };

      const addHeroBeam = (suffix: string) => {
        const heroEl = document.querySelector(".game-table__console-heroes");
        const heroRect = heroEl?.getBoundingClientRect();
        if (!heroRect) return;
        beams.push({
          id: nextBeamId(suffix),
          x1: startX,
          y1: startY,
          x2: heroRect.left + heroRect.width / 2,
          y2: heroRect.top + heroRect.height / 2,
          color: colorMap[type],
          type,
        });
      };

      if (type === "draw") {
        const consoleEl = document.querySelector(".game-table__console-hand");
        const consoleRect = consoleEl?.getBoundingClientRect();
        const endX = consoleRect ? consoleRect.left + consoleRect.width / 2 : window.innerWidth / 2;
        const endY = consoleRect ? consoleRect.top + 30 : window.innerHeight - 100;
        beams.push({
          id: nextBeamId("draw"),
          x1: startX,
          y1: startY - 20,
          x2: endX,
          y2: endY,
          color: colorMap.draw,
          type: "draw",
        });
      } else if (type === "heal" && aoeHeal) {
        const seats = document.querySelectorAll(".opponent-seat:not(.opponent-seat--dead)");
        seats.forEach((seat, idx) => {
          const rect = seat.getBoundingClientRect();
          beams.push({
            id: nextBeamId(`heal_${idx}`),
            x1: startX,
            y1: startY,
            x2: rect.left + rect.width / 2,
            y2: rect.top + rect.height / 2,
            color: colorMap.heal,
            type: "heal",
          });
        });
        addHeroBeam("me_heal");
      } else if (targetId) {
        if (targetId === state.myPlayerId) {
          addHeroBeam("me");
        } else {
          const victim = document.querySelector(`#seat-${targetId}`);
          if (victim) {
            const rect = victim.getBoundingClientRect();
            beams.push({
              id: nextBeamId("single"),
              x1: startX,
              y1: startY,
              x2: rect.left + rect.width / 2,
              y2: rect.top + rect.height / 2,
              color: colorMap[type],
              type,
            });
          }
        }
      } else if (type === "heal") {
        addHeroBeam("self_heal");
      } else {
        const seats = document.querySelectorAll(".opponent-seat:not(.opponent-seat--dead)");
        seats.forEach((seat, idx) => {
          const rect = seat.getBoundingClientRect();
          beams.push({
            id: nextBeamId(`aoe_${idx}`),
            x1: startX,
            y1: startY,
            x2: rect.left + rect.width / 2,
            y2: rect.top + rect.height / 2,
            color: colorMap[type],
            type,
          });
        });
      }

      if (beams.length > 0) {
        setVfxBeams((prev) => [...prev, ...beams]);
        scheduleTimeout(() => {
          setVfxBeams((prev) => prev.filter((b) => !beams.some((nb) => nb.id === b.id)));
        }, 700);
      }
    },
    [scheduleTimeout, state.myPlayerId]
  );

  useEffect(() => {
    triggerVfxRef.current = triggerVfx;
  }, [triggerVfx]);

  const handleSelectHandCard = (card: Card) => {
    if (isTurnLocked) return;
    setSelectedGreenCardId(null);

    if (skillMode === "SID_KETCHUM_HEAL") {
      const next = skillDiscardIds.includes(card.id)
        ? skillDiscardIds.filter((id) => id !== card.id)
        : skillDiscardIds.length < 2
        ? [...skillDiscardIds, card.id]
        : skillDiscardIds;
      setSkillDiscardIds(next);
      return;
    }

    if (skillMode === "JOSE_DELGADO_DRAW") {
      if (card.border !== "blue") {
        showError("Select a blue card for Jose Delgado.");
        return;
      }
      setSkillDiscardIds((prev) => (prev.includes(card.id) ? [] : [card.id]));
      return;
    }

    if (skillMode === "DOC_HOLYDAY_BANG") {
      const next = skillDiscardIds.includes(card.id)
        ? skillDiscardIds.filter((id) => id !== card.id)
        : skillDiscardIds.length < 2
        ? [...skillDiscardIds, card.id]
        : skillDiscardIds;
      setSkillDiscardIds(next);
      return;
    }

    // Extra discard cost card already selected: click another card to toggle extra discard
    if (requiresExtraDiscard && selectedCard && selectedCard.id !== card.id) {
      const next = discardCostIds.includes(card.id)
        ? discardCostIds.filter((id) => id !== card.id)
        : [card.id];
      setDiscardCostIds(next);
      if (next.length === 0) {
        setSelectedTargetId(null);
      }
      return;
    }

    // Sniper event: optionally select 2nd BANG! card
    if (
      isSniperBangSelected &&
      selectedCard &&
      card.id !== selectedCard.id &&
      isBangCardForMe(card)
    ) {
      setDiscardCostIds((prev) =>
        prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [card.id]
      );
      return;
    }

    if (selectedHandCardId === card.id) {
      setSelectedHandCardId(null);
      setDiscardCostIds([]);
      setSelectedTargetId(null);
    } else {
      setSelectedHandCardId(card.id);
      setDiscardCostIds([]);
      setSelectedTargetId(null);
    }
  };

  const handleCancelSelection = () => {
    setSelectedHandCardId(null);
    setSelectedGreenCardId(null);
    setDiscardCostIds([]);
    setSelectedTargetId(null);
    setSkillMode(null);
    setSkillDiscardIds([]);
  };

  const clearSelectionsForSkill = () => {
    setSelectedHandCardId(null);
    setSelectedGreenCardId(null);
    setDiscardCostIds([]);
    setSelectedTargetId(null);
    setSkillDiscardIds([]);
  };

  const handleTriggerSkill = (heroId: string) => {
    if (isTurnLocked) {
      showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
      return;
    }
    if (isActionLocked) {
      showError("Active skills can only be used during Phase 2 of your turn.");
      return;
    }

    const hero = effectiveSkillHeroes.find((h) => h.id === heroId);
    if (!hero) return;

    if (hero.name === "Chuck Wengam") {
      if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
        setSkillMode(null);
        setSkillDiscardIds([]);
        return;
      }
      if (isMock && myHp <= 1) {
        showError("Cannot sacrifice your last HP.");
        return;
      }
      clearSelectionsForSkill();
      setSkillMode("CHUCK_WENGAM_SACRIFICE");
      return;
    }

    if (hero.name === "Jose Delgado") {
      if (skillMode === "JOSE_DELGADO_DRAW") {
        setSkillMode(null);
        setSkillDiscardIds([]);
        return;
      }
      const preselectedBlueId = selectedCard?.border === "blue" ? selectedCard.id : null;
      clearSelectionsForSkill();
      setSkillDiscardIds(preselectedBlueId ? [preselectedBlueId] : []);
      setSkillMode("JOSE_DELGADO_DRAW");
      return;
    }

    if (hero.name === "Sid Ketchum") {
      if (skillMode === "SID_KETCHUM_HEAL") {
        setSkillMode(null);
        setSkillDiscardIds([]);
      } else {
        clearSelectionsForSkill();
        setSkillMode("SID_KETCHUM_HEAL");
      }
      return;
    }

    if (hero.name === "Doc Holyday") {
      if (skillMode === "DOC_HOLYDAY_BANG") {
        setSkillMode(null);
        setSkillDiscardIds([]);
        setSelectedTargetId(null);
      } else {
        clearSelectionsForSkill();
        setSkillMode("DOC_HOLYDAY_BANG");
      }
      return;
    }

    showError(`${hero.name} active skill is pending Wave 3 implementation.`);
  };

  const handleConfirmSkill = () => {
    if (isTurnLocked) {
      showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
      return;
    }
    if (isActionLocked) {
      showError("Active skills can only be used during Phase 2 of your turn.");
      return;
    }

    if (skillMode === "CHUCK_WENGAM_SACRIFICE") {
      if (isMock) {
        if (myHp <= 1) {
          showError("Cannot sacrifice your last HP.");
          return;
        }
        setMyHp((prev) => prev - 1);
        triggerVfx("draw");
        setState((prev) => ({
          ...prev,
          combatLog: [
            "Chuck Wengam: -1 HP, Draw 2",
            ...prev.combatLog,
          ],
        }));
      } else {
        sendWsMessage("USE_ACTIVE_SKILL", {
          payload: { skillType: "CHUCK_WENGAM_SACRIFICE" },
        });
      }
      setSkillMode(null);
      setSkillDiscardIds([]);
      return;
    }

    if (skillMode === "JOSE_DELGADO_DRAW") {
      const chosenCard = activeHand.find((c) => c.id === skillDiscardIds[0]);
      if (!chosenCard || chosenCard.border !== "blue") {
        showError("Select a blue card for Jose Delgado.");
        return;
      }
      if (isMock) {
        setMyHand((prev) => prev.filter((c) => c.id !== chosenCard.id));
        triggerVfx("draw");
        setState((prev) => ({
          ...prev,
          combatLog: [
            `Jose Delgado: -${chosenCard.name}, Draw 2`,
            ...prev.combatLog,
          ],
        }));
      } else {
        sendWsMessage("USE_ACTIVE_SKILL", {
          payload: {
            skillType: "JOSE_DELGADO_DRAW",
            cardId: chosenCard.id,
          },
        });
      }
      setSelectedHandCardId(null);
      setSkillMode(null);
      setSkillDiscardIds([]);
      return;
    }

    if (skillMode === "SID_KETCHUM_HEAL") {
      if (skillDiscardIds.length !== 2) {
        showError("Select 2 cards from your hand for Sid Ketchum.");
        return;
      }
      const chosenIds = skillDiscardIds.slice(0, 2);
      if (!isMock) {
        sendWsMessage("USE_ACTIVE_SKILL", {
          payload: {
            skillType: "SID_KETCHUM_HEAL",
            discardCardIds: chosenIds,
          },
        });
      } else {
        setMyHand((prev) => prev.filter((c) => !chosenIds.includes(c.id)));
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        triggerVfx("heal", state.myPlayerId);
        setState((prev) => ({
          ...prev,
          combatLog: [
            "Sid Ketchum: +1 HP",
            ...prev.combatLog,
          ],
        }));
      }
      setSkillMode(null);
      setSkillDiscardIds([]);
      return;
    }

    if (skillMode === "DOC_HOLYDAY_BANG") {
      if (skillDiscardIds.length < 2) {
        showError("Select 2 cards from your hand to discard for Doc Holyday.");
        return;
      }
      if (!selectedTargetId) {
        showError("Select a target opponent to shoot.");
        return;
      }
      if (!isMock) {
        sendWsMessage("USE_ACTIVE_SKILL", {
          payload: {
            skillType: "DOC_HOLYDAY_BANG",
            discardCardIds: skillDiscardIds.slice(0, 2),
            targetPlayerId: selectedTargetId,
          },
        });
      } else {
        setMyHand((prev) => prev.filter((c) => !skillDiscardIds.includes(c.id)));
        triggerVfx("bullet", selectedTargetId);
        setState((prev) => ({
          ...prev,
          combatLog: [
            "Doc Holyday: BANG!",
            ...prev.combatLog,
          ],
        }));
      }
      setSkillMode(null);
      setSkillDiscardIds([]);
      setSelectedTargetId(null);
    }
  };

  const applyMockManipulation = (
    targetPlayerId: string,
    chosen: { region: string; cardId?: string; label: string },
    isSteal: boolean,
    actionName: string
  ) => {
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== targetPlayerId) return p;
        const nextEquip = { ...p.equipments };
        let nextHandCount = p.handCount;
        let nextGreen = p.greenCards;
        let nextHasJail = p.hasJail;
        let nextHasDyn = p.hasDynamite;
        let nextJudgements = p.judgements;

        if (chosen.region === "hand" && nextHandCount > 0) {
          nextHandCount -= 1;
        } else if (chosen.region === "equipment" && chosen.cardId) {
          if (nextEquip.weapon?.id === chosen.cardId) delete nextEquip.weapon;
          else if (nextEquip.horseDef?.id === chosen.cardId) delete nextEquip.horseDef;
          else if (nextEquip.horseOff?.id === chosen.cardId) delete nextEquip.horseOff;
          else if (nextEquip.barrel?.id === chosen.cardId) delete nextEquip.barrel;
          else if (nextEquip.extra?.id === chosen.cardId) delete nextEquip.extra;
        } else if (chosen.region === "green" && chosen.cardId) {
          nextGreen = nextGreen.filter((g) => g.id !== chosen.cardId);
        } else if (chosen.region === "judgement" && chosen.cardId) {
          if (chosen.cardId === "jail") nextHasJail = false;
          if (chosen.cardId === "dynamite") nextHasDyn = false;
          if (nextJudgements) {
            nextJudgements = nextJudgements.filter((j) => j.id !== chosen.cardId);
          }
        }
        return {
          ...p,
          handCount: nextHandCount,
          equipments: nextEquip,
          greenCards: nextGreen,
          hasJail: nextHasJail,
          hasDynamite: nextHasDyn,
          judgements: nextJudgements,
        };
      }),
      combatLog: [
        `${actionName}: ${isSteal ? "Steal" : "Discard"} ${chosen.label}`,
        ...prev.combatLog,
      ],
    }));
  };

  const handlePlayCard = () => {
    if (isTurnLocked) {
      showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
      return;
    }

    // 1. Green Card Activation Flow
    if (selectedGreenCard) {
      if (isActionLocked) {
        showError("Green cards can only be activated during Phase 2 of your turn.");
        return;
      }
      if (selectedGreenCard.isDelay) {
        showError(`${selectedGreenCard.card.name} is still pending until your next turn.`);
        return;
      }

      const gName = selectedGreenCard.card.name;
      if (gName === "CAN CAN" || gName === "CONESTOGA") {
        if (!selectedTargetId) {
          showError(`Select a target opponent for ${gName}.`);
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(`${target?.name || "Target"} has no cards to steal or discard.`);
          return;
        }
        setCardPickerConfig({
          isOpen: true,
          targetPlayer: target,
          action: gName === "CAN CAN" ? "destroy" : "steal",
          cardName: gName,
          sourceGreenCardId: selectedGreenCard.id,
        });
        return;
      }

      if (TARGETED_SINGLE_CARDS.has(gName) && !selectedTargetId) {
        showError(`Select a target opponent for ${gName}.`);
        return;
      }

      if (!isMock) {
        if (
          sendWsMessage("ACTIVATE_GREEN_CARD", {
            greenCardId: selectedGreenCard.id,
            cardId: selectedGreenCard.card.id,
            targetPlayerId: selectedTargetId || undefined,
          })
        ) {
          handleCancelSelection();
        }
        return;
      }

      if (TARGETED_SINGLE_CARDS.has(gName)) {
        triggerVfx("bullet", selectedTargetId!);
      } else if (gName === "CANTEEN") {
        setMyHp((prev) => Math.min(prev + 1, myMaxHp));
        triggerVfx("heal", state.myPlayerId);
      } else if (gName === "PONY EXPRESS") {
        triggerVfx("draw");
      } else {
        triggerVfx("bullet");
      }

      setMyGreenCards((prev) => prev.filter((g) => g.id !== selectedGreenCard.id));
      setSelectedGreenCardId(null);
      setSelectedTargetId(null);
      setState((prev) => ({
        ...prev,
        combatLog: [
          `You: ${gName}`,
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (!selectedCard) return;

    if (requiresExtraDiscard && discardCostIds.length < 1) {
      showError(`${selectedCard.name}: Select 1 additional card in hand to discard.`);
      return;
    }

    // 3. Live Multiplayer WebSocket Dispatch
    if (!isMock) {
      if (state.currentPhase === 3) {
        if (!isMyTurn) return;
        if (sendWsMessage("DISCARD_CARD", { cardId: selectedCard.id })) {
          handleCancelSelection();
        }
        return;
      }

      if (isActionLocked) {
        showError("Cards can only be played during Phase 2 of your turn.");
        return;
      }

      // Green cards placed from hand never take a target
      if (selectedCard.border === "green") {
        if (
          sendWsMessage("PLAY_CARD", {
            cardId: selectedCard.id,
          })
        ) {
          handleCancelSelection();
        }
        return;
      }

      if (MANIPULATE_CARDS.has(selectedCard.name)) {
        if (!selectedTargetId) {
          showError(`Select a target opponent for ${selectedCard.name}.`);
          return;
        }
        const target = state.players.find((p) => p.id === selectedTargetId);
        if (!target || countInspectableCards(target) === 0) {
          showError(`${target?.name || "Target"} has no cards in any zone.`);
          return;
        }
        setCardPickerConfig({
          isOpen: true,
          targetPlayer: target,
          action:
            selectedCard.name === "CAT BALOU" || selectedCard.name === "CAN CAN"
              ? "destroy"
              : "steal",
          cardName: selectedCard.name,
        });
        return;
      }

      if ((TARGETED_SINGLE_CARDS.has(selectedCard.name) || isBangCardForMe(selectedCard)) && !selectedTargetId) {
        showError(`Select a target opponent for ${selectedCard.name}.`);
        return;
      }

      if (
        sendWsMessage("PLAY_CARD", {
          cardId: selectedCard.id,
          targetPlayerId: selectedTargetId || undefined,
          discardCardIds: discardCostIds.length > 0 ? discardCostIds : undefined,
        })
      ) {
        handleCancelSelection();
      }
      return;
    }

    // 4. Offline / Mock Mode Execution
    if (selectedCard.border === "green") {
      if (myGreenCards.length >= 10) {
        showError("Green-Delay Grid is full (max 10 cards).");
        return;
      }
      setMyGreenCards((prev) => [
        ...prev,
        { id: `g_${Date.now()}`, card: selectedCard, isDelay: true },
      ]);
      setMyHand((prev) => prev.filter((c) => c.id !== selectedCard.id));
      handleCancelSelection();
      setState((prev) => ({
        ...prev,
        combatLog: [
          `Set: ${selectedCard.name}`,
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (MANIPULATE_CARDS.has(selectedCard.name)) {
      if (!selectedTargetId) {
        showError(`Select a target opponent for ${selectedCard.name}.`);
        return;
      }
      const target = state.players.find((p) => p.id === selectedTargetId);
      if (!target || countInspectableCards(target) === 0) {
        showError(`${target?.name || "Target"} has no cards in any zone.`);
        return;
      }
      setCardPickerConfig({
        isOpen: true,
        targetPlayer: target,
        action:
          selectedCard.name === "CAT BALOU" || selectedCard.name === "CAN CAN"
            ? "destroy"
            : "steal",
        cardName: selectedCard.name,
      });
      triggerVfx("bullet", target.id);
      return;
    }

    const removedIds = new Set([selectedCard.id, ...discardCostIds]);

    if (selectedCard.name === "BEER" || selectedCard.name === "WHISKY" || selectedCard.name === "TEQUILA") {
      const healAmt = selectedCard.name === "WHISKY" ? 2 : 1;
      const healTarget = selectedCard.name === "TEQUILA" && selectedTargetId ? selectedTargetId : state.myPlayerId;
      if (healTarget === state.myPlayerId) {
        setMyHp((prev) => Math.min(prev + healAmt, myMaxHp));
      }
      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      handleCancelSelection();
      triggerVfx("heal", healTarget, false);
      setState((prev) => ({
        ...prev,
        combatLog: [
          `You: ${selectedCard.name} (+${healAmt} HP)`,
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (selectedCard.name === "SALOON") {
      setMyHp((prev) => Math.min(prev + 1, myMaxHp));
      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      handleCancelSelection();
      triggerVfx("heal", undefined, true);
      setState((prev) => ({
        ...prev,
        combatLog: [
          "You: SALOON (+1 HP all)",
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (selectedCard.name === "GATLING" || selectedCard.name === "INDIANS!" || selectedCard.name === "BRAWL") {
      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      handleCancelSelection();
      triggerVfx("bullet");
      setState((prev) => ({
        ...prev,
        combatLog: [
          `You: ${selectedCard.name}`,
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (selectedCard.border === "blue" && selectedCard.range) {
      setMyEquipments((prev) => ({ ...prev, weapon: selectedCard }));
      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      handleCancelSelection();
      setState((prev) => ({
        ...prev,
        combatLog: [
          `Equip: ${selectedCard.name}`,
          ...prev.combatLog,
        ],
      }));
      return;
    }

    if (selectedCard.name === "BANG!" || selectedCard.name === "SPRINGFIELD" || selectedCard.name === "PUNCH") {
      if (!selectedTargetId) {
        showError(`Select a target opponent for ${selectedCard.name}.`);
        return;
      }
      const target = state.players.find((p) => p.id === selectedTargetId);
      if (!target) return;

      triggerVfx("bullet", target.id);

      const newInFlight: Card = selectedCard;
      setState((prev) => ({
        ...prev,
        inFlightCards: [
          ...prev.inFlightCards,
          {
            id: `inf_${Date.now()}`,
            card: newInFlight,
            sourcePlayerName: "You",
            targetPlayerName: target.name,
            actionText: "Awaiting reaction with Missed!.",
          },
        ],
        combatLog: [
          `You -> ${target.name}: ${selectedCard.name}`,
          ...prev.combatLog,
        ],
      }));

      scheduleTimeout(() => {
        setState((prev) => ({
          ...prev,
          inFlightCards: prev.inFlightCards.filter((c) => c.card.id !== newInFlight.id),
          discardCount: prev.discardCount + 1,
          topDiscard: newInFlight,
        }));
      }, 2800);

      setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
      handleCancelSelection();
      return;
    }

    setMyHand((prev) => prev.filter((c) => !removedIds.has(c.id)));
    handleCancelSelection();
    setState((prev) => ({
      ...prev,
      combatLog: [
        `You: ${selectedCard.name}`,
        ...prev.combatLog,
      ],
    }));
  };

  const handleEndTurn = () => {
    if (isTurnLocked) {
      showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
      return;
    }
    if (!isMock && !isMyTurn) return;

    if (!isMock) {
      if (sendWsMessage("END_TURN", {})) {
        handleCancelSelection();
      }
      return;
    }

    setState((prev) => ({
      ...prev,
      inFlightCards: [],
      currentPhase: 1,
      combatLog: [
        "End Turn",
        ...prev.combatLog,
      ],
    }));

    if (myJudgements.hasDynamite) {
      const isExploded = Math.random() < 0.25;
      const dynSrcCard: Card = {
        id: `dyn_src_${Date.now()}`,
        name: "DYNAMITE",
        suit: "hearts",
        rank: "2",
        border: "blue",
        image: "/assets/images/cards/card_dynamite.png",
        desc: "Dynamite judgement.",
      };
      const dynFlipCard: Card = {
        id: `dyn_chk_${Date.now()}`,
        name: isExploded ? "BANG!" : "MISSED!",
        suit: isExploded ? "spades" : "hearts",
        rank: isExploded ? "4" : "10",
        border: "brown",
        image: isExploded ? "/assets/images/cards/card_bang.png" : "/assets/images/cards/card_missed.png",
        desc: isExploded ? "Spades 2-9: Exploded for 3 damage!" : "Check passed.",
      };
      const srcEntry: InFlightCard = {
        id: `inf_dynsrc_${Date.now()}`,
        card: dynSrcCard,
        sourcePlayerName: "You",
        actionText: "DYNAMITE Judgement",
      };
      const dynEntry: InFlightCard = {
        id: `inf_dyn_${Date.now()}`,
        card: dynFlipCard,
        sourcePlayerName: "You (Flipped)",
        actionText: isExploded ? "Spades 4 (EXPLODED! -3 HP)" : "Hearts 10 (PASSED)",
      };
      const ids = new Set([srcEntry.id, dynEntry.id]);
      setEphemeralCheckCards((prev) => [...prev, srcEntry, dynEntry]);
      if (isExploded) {
        triggerVfx("dynamite", state.myPlayerId);
        setMyHp((h) => Math.max(0, h - 3));
        setMyJudgements((j) => ({ ...j, hasDynamite: false }));
      }
      scheduleTimeout(() => {
        setEphemeralCheckCards((prev) => prev.filter((c) => !ids.has(c.id)));
      }, 3000);
    }

    if (myJudgements.hasJail) {
      const isEscaped = Math.random() < 0.25;
      const jailSrcCard: Card = {
        id: `jail_src_${Date.now()}`,
        name: "JAIL",
        suit: "spades",
        rank: "J",
        border: "blue",
        image: "/assets/images/cards/card_jail.png",
        desc: "Jail judgement.",
      };
      const jailFlipCard: Card = {
        id: `jail_chk_${Date.now()}`,
        name: isEscaped ? "BEER" : "PANIC!",
        suit: isEscaped ? "hearts" : "clubs",
        rank: isEscaped ? "J" : "7",
        border: "brown",
        image: isEscaped ? "/assets/images/cards/card_beer.png" : "/assets/images/cards/card_panic.png",
        desc: isEscaped ? "Heart: Escaped jail!" : "Check failed: Lost turn.",
      };
      const srcEntry: InFlightCard = {
        id: `inf_jailsrc_${Date.now()}`,
        card: jailSrcCard,
        sourcePlayerName: "You",
        actionText: "JAIL Judgement",
      };
      const jailEntry: InFlightCard = {
        id: `inf_jail_${Date.now()}`,
        card: jailFlipCard,
        sourcePlayerName: "You (Flipped)",
        actionText: isEscaped ? "Hearts J (ESCAPED!)" : "Clubs 7 (LOCKED!)",
      };
      const ids = new Set([srcEntry.id, jailEntry.id]);
      setEphemeralCheckCards((prev) => [...prev, srcEntry, jailEntry]);
      setMyJudgements((j) => ({ ...j, hasJail: false }));
      scheduleTimeout(() => {
        setEphemeralCheckCards((prev) => prev.filter((c) => !ids.has(c.id)));
      }, 3000);
    }

    triggerVfx("draw");
    setMyGreenCards((prev) =>
      prev.map((g) => (GREEN_DEFENSE_NAMES.has(g.card.name) ? { ...g, isDelay: false } : g))
    );
    handleCancelSelection();
  };

  const handleTriggerGreenCard = (gCard: GreenCard) => {
    if (isTurnLocked) {
      showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
      return;
    }
    if (isActionLocked) {
      showError("Green cards can only be activated during Phase 2 of your turn.");
      return;
    }

    if (gCard.isDelay) {
      showError(`${gCard.card.name} is still pending until your next turn.`);
      return;
    }

    if (GREEN_DEFENSE_NAMES.has(gCard.card.name)) {
      showError(
        `${gCard.card.name} is a defense card — activate it from the Defense prompt when attacked.`
      );
      return;
    }

    setSelectedHandCardId(null);
    setDiscardCostIds([]);
    setSkillMode(null);
    setSkillDiscardIds([]);
    setSelectedTargetId(null);
    setSelectedGreenCardId((prev) => (prev === gCard.id ? null : gCard.id));
  };

  const activeSkillHint =
    skillMode === "CHUCK_WENGAM_SACRIFICE"
      ? "Chuck Wengam: Sacrifice 1 HP to draw 2 cards - Click Confirm Skill"
      : skillMode === "JOSE_DELGADO_DRAW"
      ? `Jose Delgado: Select 1 blue card (${skillDiscardIds.length}/1) - Click Confirm Skill`
      : skillMode === "SID_KETCHUM_HEAL"
      ? `Sid Ketchum: Select 2 cards (${skillDiscardIds.length}/2) - Click Confirm Skill`
      : skillMode === "DOC_HOLYDAY_BANG"
      ? `Doc Holyday: Select 2 cards (${skillDiscardIds.length}/2) & a target - Click Confirm Skill`
      : selectedGreenCard
      ? TARGETED_GREEN_CARDS.has(selectedGreenCard.card.name) && !selectedTargetId
        ? `Green Ready: ${selectedGreenCard.card.name} - Select a target opponent, then click Play.`
        : `Green Ready: ${selectedGreenCard.card.name} - Click Play to activate.`
      : selectedCard && selectedCard.border === "green" && state.currentPhase !== 3
      ? GREEN_DEFENSE_NAMES.has(selectedCard.name)
        ? `Green Defense (${selectedCard.name}): Click Play to place in front of you (ready after your turn).`
        : `Green Card (${selectedCard.name}): Click Play to place in play (ready next turn).`
      : requiresExtraDiscard && selectedCard
      ? activeHand.length < 2
        ? `${selectedCard.name}: Requires 1 extra discard card, but your hand has no second card.`
        : discardCostIds.length < 1
        ? `${selectedCard.name}: Select 1 extra card in hand to discard (0/1).`
        : TARGETED_SINGLE_CARDS.has(selectedCard.name) || MANIPULATE_CARDS.has(selectedCard.name)
        ? selectedTargetId
          ? `${selectedCard.name}: Extra discard ready (1/1) - Click Play.`
          : `${selectedCard.name}: Extra discard ready (1/1) - Select a target opponent.`
        : `${selectedCard.name}: Extra discard ready (1/1) - Click Play.`
      : isSniperBangSelected
      ? discardCostIds.length > 0
        ? "Sniper: 2nd BANG! selected (requires 2 Missed!) - Select target & click Play."
        : "Sniper: Select target for normal shot, or pick 2nd BANG! first."
      : canRicochetEquip
      ? "Ricochet: Click Play to shoot HP, or Ricochet Equip to shoot a card in play."
      : null;

  const isSkillMode = skillMode !== null;

  const canConfirmSkill =
    !isTurnLocked &&
    !isActionLocked &&
    (skillMode === "CHUCK_WENGAM_SACRIFICE"
      ? !isMock || myHp > 1
      : skillMode === "JOSE_DELGADO_DRAW"
      ? skillDiscardIds.length === 1
      : skillMode === "SID_KETCHUM_HEAL"
      ? skillDiscardIds.length === 2
      : skillMode === "DOC_HOLYDAY_BANG"
      ? skillDiscardIds.length === 2 && Boolean(selectedTargetId)
      : false);

  const canConfirmAction =
    !isTurnLocked &&
    !isSkillMode &&
    Boolean(
      (selectedCard && (!requiresExtraDiscard || discardCostIds.length >= 1)) ||
        selectedGreenCard
    );

  const effectiveCandidatePool = candidateHeroesOverride || mockCandidateHeroes;

  const myCharSelect = state.pendingCharacterSelect;
  const isLiveCharSelectOpen =
    !isMock &&
    state.matchPhase === "CHARACTER_SELECT" &&
    Boolean(myCharSelect) &&
    !myCharSelect?.selectedCharacterIds?.length &&
    (myCharSelect?.candidates?.length ?? 0) > 0;
  const isWaitingOtherCharSelect =
    !isMock && state.matchPhase === "CHARACTER_SELECT" && !isLiveCharSelectOpen;
  const isCharSelectOpen =
    isLiveCharSelectOpen || (isMock && (showCharSelectModal || forcedModal === "char_select"));

  const myBlueCardsInPlay: BlueCardInPlayItem[] = [];
  if (activeEquipments.weapon) {
    myBlueCardsInPlay.push({ id: activeEquipments.weapon.id, label: activeEquipments.weapon.name, card: activeEquipments.weapon });
  }
  if (activeEquipments.barrel) {
    myBlueCardsInPlay.push({ id: activeEquipments.barrel.id, label: activeEquipments.barrel.name, card: activeEquipments.barrel });
  }
  if (activeEquipments.horseDef) {
    myBlueCardsInPlay.push({ id: activeEquipments.horseDef.id, label: activeEquipments.horseDef.name, card: activeEquipments.horseDef });
  }
  if (activeEquipments.horseOff) {
    myBlueCardsInPlay.push({ id: activeEquipments.horseOff.id, label: activeEquipments.horseOff.name, card: activeEquipments.horseOff });
  }
  const extraList =
    activeEquipments.extras && activeEquipments.extras.length > 0
      ? activeEquipments.extras
      : activeEquipments.extra
      ? [activeEquipments.extra]
      : [];
  extraList.forEach((c) => {
    myBlueCardsInPlay.push({ id: c.id, label: c.name, card: c });
  });
  activeGreenCards.forEach((g) => {
    if (g.card.border === "blue") {
      myBlueCardsInPlay.push({ id: g.card.id, label: g.card.name, card: g.card });
    }
  });
  (myPlayer?.judgements || []).forEach((j) => {
    if (j.card && j.card.border === "blue") {
      myBlueCardsInPlay.push({ id: j.card.id, label: j.card.name, card: j.card });
    }
  });

  const isDefenseOpen = !isMock ? Boolean(state.myPendingReaction) : forcedModal === "defense";
  const effectiveDefenseReaction = !isMock ? state.myPendingReaction : mockScenarioReaction;
  const isGeneralStoreOpen =
    !isMock
      ? Boolean(state.generalStore && state.generalStore.pool.length > 0)
      : forcedModal === "general_store" && Boolean(mockScenarioGeneralStore);
  const effectiveGeneralStore = !isMock ? state.generalStore : mockScenarioGeneralStore;
  const isGameOverOpen = !isMock ? Boolean(state.gameOver) : forcedModal === "game_over";
  const effectiveGameOver = !isMock ? state.gameOver : mockScenarioGameOver;

  const displayInFlightCards = useMemo(() => {
    const activeEventEntry: InFlightCard[] = state.activeEvent
      ? [
          {
            id: `active_evt_${state.activeEvent.id}`,
            card: {
              id: state.activeEvent.id,
              name: state.activeEvent.name,
              border: "brown",
              rank: "A",
              suit: "clubs",
              desc: state.activeEvent.desc,
              image: state.activeEvent.image,
            },
            sourcePlayerName:
              state.activeEvent.pack === "fistful" ? "A Fistful of Cards" : "High Noon",
            actionText: state.activeEvent.name,
          },
        ]
      : [];
    const combined = [...activeEventEntry, ...state.inFlightCards, ...ephemeralCheckCards];
    const seen = new Set<string>();
    return combined.filter((c) => {
      const key = c.card?.id || c.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [state.activeEvent, state.inFlightCards, ephemeralCheckCards]);

  return (
    <div className="game-table">
      {errorNotice && (
        <div className="game-table__error-toast" role="alert">
          {errorNotice}
        </div>
      )}

      {!isMock && (!isWsConnected || state.matchPaused || isWaitingOtherCharSelect) && (
        <div className="game-table__status-banner" role="status">
          {!isWsConnected
            ? "Connection lost. Reconnecting to match server..."
            : state.matchPaused
            ? "Match paused: Waiting for disconnected players..."
            : `Waiting for other players to choose characters (${myCharSelect?.submittedPlayerIds?.length ?? 0}/${myCharSelect?.totalPlayers ?? state.players.length})...`}
        </div>
      )}

      <svg className="game-table__vfx-canvas" aria-hidden="true">
        <defs>
          <linearGradient id="bulletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#eab308" stopOpacity="1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {vfxBeams.map((beam) => (
          <g key={beam.id}>
            <line
              x1={beam.x1}
              y1={beam.y1}
              x2={beam.x2}
              y2={beam.y2}
              stroke={beam.color}
              strokeWidth="4"
              strokeDasharray="10 6"
              filter="url(#glow)"
              className="game-table__vfx-line"
            />
            <circle
              cx={beam.x2}
              cy={beam.y2}
              r="8"
              fill={beam.color}
              className="game-table__vfx-impact"
            />
          </g>
        ))}
      </svg>

      <TargetingArrow
        targetPlayerId={selectedTargetId}
        hasSourceSelection={Boolean(selectedCard || selectedGreenCard)}
        isSkillOrigin={skillMode === "DOC_HOLYDAY_BANG"}
      />

      <TableTopBar
        roomId={state.roomId}
        hostInfo={state.hostInfo}
        currentPhase={state.currentPhase}
        isMock={isMock}
        roundNumber={state.roundNumber}
        isMyTurn={isMyTurn}
        activePlayerName={activePlayerName}
        activeEvent={state.activeEvent}
        onOpenCharSelect={() => setShowCharSelectModal(true)}
        onBackToLobby={() => {
          shouldReconnectRef.current = false;
          closeSocket();
          onBackToLobby?.();
        }}
      />

      <main className="game-table__main">
        <div className="game-table__arena">
          <OpponentRing
            opponents={opponents}
            selectedCard={selectedCard}
            selectedGreenCard={selectedGreenCard}
            forcedTargetMode={
              skillMode === "DOC_HOLYDAY_BANG"
                ? "BANG!"
                : selectedCard?.name === "MISSED!" && isBangCardForMe(selectedCard)
                ? "BANG!"
                : null
            }
            ricochetActive={isRicochetActive}
            selectedTargetId={selectedTargetId}
            weaponRange={activeEquipments.weapon?.range || 1}
            canTarget={!isActionLocked && (!requiresExtraDiscard || discardCostIds.length >= 1)}
            disabled={isTurnLocked}
            onSelectTarget={(id) => {
              if (isActionLocked) return;
              if (requiresExtraDiscard && discardCostIds.length < 1) {
                showError(`${selectedCard?.name || "Card"}: Select 1 extra card in hand first.`);
                return;
              }
              setSelectedTargetId((prev) => (prev === id ? null : id));
            }}
            centerNode={<InFlightChain cards={displayInFlightCards} />}
          />
        </div>

        <TableSidebar
          myRole={state.myRole}
          roleCounts={state.roleCounts}
          combatLog={state.combatLog}
          deckCount={state.deckCount}
          discardCount={state.discardCount}
          topDiscard={state.topDiscard || (isMock ? initialMockState.topDiscard : undefined)}
          onOpenCombatLog={() => setIsCombatLogModalOpen(true)}
        />
      </main>

      <TableActionBar
        myJudgements={activeJudgements}
        heroes={effectiveSkillHeroes}
        myHp={activeHp}
        myMaxHp={activeMaxHp}
        selectedCard={selectedCard}
        selectedGreenCard={selectedGreenCard}
        selectedTargetId={selectedTargetId}
        isMock={isMock}
        currentPhase={state.currentPhase}
        isMyTurn={isMyTurn}
        isLocked={isTurnLocked}
        excessCardsCount={excessCardsCount}
        activeSkillHint={activeSkillHint}
        canConfirmSelection={canConfirmAction}
        isSkillMode={isSkillMode}
        canConfirmSkill={canConfirmSkill}
        canRicochetEquip={canRicochetEquip}
        onPlayCard={handlePlayCard}
        onRicochetEquip={() => {
          if (!selectedTargetPlayer || countInPlayCards(selectedTargetPlayer) === 0) return;
          setCardPickerConfig({
            isOpen: true,
            targetPlayer: selectedTargetPlayer,
            action: "destroy",
            cardName: "RICOCHET",
            allowHand: false,
          });
        }}
        onConfirmSkill={handleConfirmSkill}
        onCancel={handleCancelSelection}
        onEndTurn={handleEndTurn}
        onTriggerSkill={handleTriggerSkill}
      />

      <PlayerConsole
        equipments={activeEquipments}
        hand={activeHand}
        greenCards={activeGreenCards}
        heroes={activeHeroes}
        myHp={activeHp}
        myMaxHp={activeMaxHp}
        selectedCardId={selectedHandCardId}
        selectedCardIds={skillDiscardIds}
        discardCardIds={discardCostIds}
        selectedGreenCardId={selectedGreenCardId}
        isLocked={isTurnLocked}
        onSelectCard={handleSelectHandCard}
        onTriggerGreenCard={handleTriggerGreenCard}
      />

      {isCharSelectOpen && (
        <CharacterSelectModal
          candidates={isLiveCharSelectOpen ? myCharSelect!.candidates : effectiveCandidatePool}
          dualMode={
            isLiveCharSelectOpen
              ? (myCharSelect!.requiredCount || 1) === 2
              : Boolean(state.dualCharacterMode)
          }
          hpRule={isLiveCharSelectOpen ? state.hpRule || "strict" : "strict"}
          isSheriff={isLiveCharSelectOpen ? Boolean(myPlayer?.isSheriff) : false}
          onCancel={
            isLiveCharSelectOpen
              ? undefined
              : () => {
                  setShowCharSelectModal(false);
                  onCloseForcedModal?.();
                }
          }
          onConfirm={(selectedHeroes) => {
            if (isLiveCharSelectOpen) {
              if (selectedHeroes.length > 0) {
                sendWsMessage("SELECT_CHARACTERS", {
                  characterIds: selectedHeroes.map((h) => h.id),
                });
              }
              return;
            }
            if (selectedHeroes.length > 0) {
              setMyHeroes(selectedHeroes);
              const minBaseHp = Math.min(...selectedHeroes.map((h) => h.baseHp));
              setMyHp(minBaseHp);
              setMyMaxHp(minBaseHp);
              setMyHand(initialMyHand);
              setMyEquipments(initialMyEquipments);
              setMyGreenCards(initialMyGreenCards);
              setState((prev) => ({
                ...prev,
                inFlightCards: [],
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] Reset mock data with heroes: ${selectedHeroes.map((h) => h.name).join(" & ")}.`,
                  ...prev.combatLog,
                ],
              }));
            }
            setShowCharSelectModal(false);
            onCloseForcedModal?.();
          }}
        />
      )}

      {!isMock && (
        <TurnPromptModal
          turnStartChoice={state.pendingTurnStartChoice}
          phase1Choice={state.pendingPhase1Choice}
          players={state.players}
          myHand={activeHand}
          myPlayerId={state.myPlayerId}
          topDiscard={state.topDiscard}
          disabled={isTurnLocked}
          onResolveTurnStart={(payload) => {
            if (!isTurnLocked) {
              sendWsMessage("RESOLVE_TURN_START", payload);
            }
          }}
          onResolvePhase1={(payload) => {
            if (!isTurnLocked) {
              sendWsMessage("RESOLVE_PHASE_1", payload);
            }
          }}
        />
      )}

      {isDefenseOpen && effectiveDefenseReaction && (
        <DefenseModal
          reaction={effectiveDefenseReaction}
          myHand={activeHand}
          heroes={effectiveSkillHeroes}
          myGreenCards={activeGreenCards}
          myBlueCardsInPlay={myBlueCardsInPlay}
          disabled={isTurnLocked}
          onBarrelCheck={() => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("RESOLVE_REACTION", { payload: { action: "BARREL_CHECK" } });
            } else {
              const isSuccess = Math.random() < 0.4;
              const barrelSrcCard: Card = {
                id: `src_bar_${Date.now()}`,
                name: "BARREL",
                suit: "spades",
                rank: "Q",
                border: "blue",
                image: "/assets/images/cards/card_barrel.png",
                desc: "Draw check for Barrel.",
              };
              const checkCard: Card = {
                id: `chk_bar_${Date.now()}`,
                name: isSuccess ? "BEER" : "BANG!",
                suit: isSuccess ? "hearts" : "spades",
                rank: isSuccess ? "K" : "4",
                border: "brown",
                image: isSuccess ? "/assets/images/cards/card_beer.png" : "/assets/images/cards/card_bang.png",
                desc: isSuccess ? "Heart drawn: Attack dodged." : "Not a Heart: Check failed.",
              };
              const srcEntry: InFlightCard = {
                id: `inf_barsrc_${Date.now()}`,
                card: barrelSrcCard,
                sourcePlayerName: "You",
                actionText: "BARREL Check",
              };
              const checkEntry: InFlightCard = {
                id: `inf_bar_${Date.now()}`,
                card: checkCard,
                sourcePlayerName: "You (Flipped)",
                actionText: isSuccess ? "Hearts K (DODGED!)" : "Spades 4 (FAILED!)",
              };
              const ids = new Set([srcEntry.id, checkEntry.id]);
              setEphemeralCheckCards((prev) => [...prev, srcEntry, checkEntry]);
              setState((prev) => ({
                ...prev,
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] Barrel Check: ${checkCard.rank} of ${checkCard.suit} -> ${isSuccess ? "DODGED" : "FAILED"}.`,
                  ...prev.combatLog,
                ],
              }));
              scheduleTimeout(() => {
                setEphemeralCheckCards((prev) => prev.filter((c) => !ids.has(c.id)));
                setState((prev) => ({
                  ...prev,
                  discardCount: prev.discardCount + 1,
                  topDiscard: checkCard,
                }));
              }, 3000);
              onCloseForcedModal?.();
            }
          }}
          onJourdonnaisCheck={() => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("RESOLVE_REACTION", { payload: { action: "BARREL_CHECK" } });
            } else {
              const isSuccess = Math.random() < 0.4;
              const checkCard: Card = {
                id: `chk_jour_${Date.now()}`,
                name: "JOURDONNAIS CHECK",
                suit: isSuccess ? "hearts" : "clubs",
                rank: isSuccess ? "Q" : "8",
                border: "blue",
                image: "/assets/images/cards/card_barrel.png",
                desc: isSuccess ? "Heart drawn: Attack dodged." : "Not a Heart: Check failed.",
              };
              const checkEntry: InFlightCard = {
                id: `inf_jour_${Date.now()}`,
                card: checkCard,
                sourcePlayerName: "You (Jourdonnais)",
                actionText: isSuccess ? "Hearts Q (DODGED!)" : "Clubs 8 (FAILED!)",
              };
              setEphemeralCheckCards((prev) => [...prev, checkEntry]);
              setState((prev) => ({
                ...prev,
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] Jourdonnais Check: ${checkCard.rank} of ${checkCard.suit} -> ${isSuccess ? "DODGED" : "FAILED"}.`,
                  ...prev.combatLog,
                ],
              }));
              scheduleTimeout(() => {
                setEphemeralCheckCards((prev) => prev.filter((c) => c.id !== checkEntry.id));
                setState((prev) => ({
                  ...prev,
                  discardCount: prev.discardCount + 1,
                  topDiscard: checkCard,
                }));
              }, 3000);
              onCloseForcedModal?.();
            }
          }}
          onPlayCard={(cardId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("RESOLVE_REACTION", { cardId });
            } else {
              setMyHand((prev) => prev.filter((c) => c.id !== cardId));
              setState((prev) => ({
                ...prev,
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] [Mock] Defended using hand card.`,
                  ...prev.combatLog,
                ],
              }));
              onCloseForcedModal?.();
            }
          }}
          onUseGreenDefense={(greenId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("RESOLVE_REACTION", {
                cardId: greenId,
                greenCardId: greenId,
                payload: { action: "USE_GREEN_DEFENSE", greenCardId: greenId },
              });
            } else {
              setMyGreenCards((prev) => prev.filter((g) => g.id !== greenId));
              setState((prev) => ({
                ...prev,
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] [Mock] Defended using ready green card.`,
                  ...prev.combatLog,
                ],
              }));
              onCloseForcedModal?.();
            }
          }}
          onDiscardBlueEquip={(cardId) => {
            if (!isMock && !isTurnLocked) {
              sendWsMessage("RESOLVE_REACTION", { targetCardId: cardId });
            }
          }}
          onSidRescue={(discardIds) => {
            if (!isMock && !isTurnLocked) {
              sendWsMessage("RESOLVE_REACTION", { discardCardIds: discardIds });
            }
          }}
          onTakeDamage={() => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("RESOLVE_REACTION", { payload: { action: "TAKE_DAMAGE" } });
            } else {
              setMyHp((prev) => Math.max(0, prev - 1));
              setState((prev) => ({
                ...prev,
                combatLog: [
                  `[${new Date().toLocaleTimeString()}] [Mock] Took 1 damage from reaction.`,
                  ...prev.combatLog,
                ],
              }));
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {isGeneralStoreOpen && effectiveGeneralStore && (
        <GeneralStoreModal
          store={effectiveGeneralStore}
          myPlayerId={state.myPlayerId}
          players={state.players}
          disabled={isTurnLocked}
          onPickCard={(cardId) => {
            if (!isMock) {
              if (isTurnLocked) return;
              sendWsMessage("SELECT_STOLEN_CARD", { cardId });
            } else {
              const picked = effectiveGeneralStore.pool.find((c) => c.id === cardId);
              if (picked) {
                setMyHand((prev) => [...prev, picked]);
              }
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {isGameOverOpen && effectiveGameOver && (
        <GameOverModal
          gameOver={effectiveGameOver}
          players={state.players}
          myRole={state.myRole}
          onReturnToLobby={() => {
            if (!isMock) {
              shouldReconnectRef.current = false;
              if (!sendWsMessage("RESET_LOBBY", {})) {
                closeSocket();
                onBackToLobby?.();
              }
            } else {
              onCloseForcedModal?.();
            }
          }}
        />
      )}

      {(cardPickerConfig.isOpen && cardPickerConfig.targetPlayer) ||
      (isMock && forcedModal === "card_picker" && opponents[0]) ? (
        <CardPickerModal
          targetPlayer={(cardPickerConfig.targetPlayer || opponents[0])!}
          action={cardPickerConfig.action}
          cardName={cardPickerConfig.cardName || "CAT BALOU"}
          allowHand={cardPickerConfig.allowHand ?? true}
          onCancel={() => {
            handleCancelSelection();
            setCardPickerConfig({ isOpen: false, action: "destroy" });
            onCloseForcedModal?.();
          }}
          onConfirm={(chosen) => {
            if (!isMock && isTurnLocked) {
              showError(isWsConnected ? "Match is paused. Actions are locked." : "Connection lost. Reconnecting...");
              return;
            }
            const target = (cardPickerConfig.targetPlayer || opponents[0])!;
            const activeCard = selectedCard || selectedGreenCard?.card;
            if (!isMock && activeCard) {
              let targetArea: "HAND" | "EQUIPMENT" | "GREEN" | "JUDGEMENT" = "HAND";
              if (chosen.region === "equipment") targetArea = "EQUIPMENT";
              else if (chosen.region === "green") targetArea = "GREEN";
              else if (chosen.region === "judgement") targetArea = "JUDGEMENT";

              sendWsMessage(
                cardPickerConfig.sourceGreenCardId ? "ACTIVATE_GREEN_CARD" : "PLAY_CARD",
                {
                  cardId: activeCard.id,
                  greenCardId: cardPickerConfig.sourceGreenCardId,
                  targetPlayerId: target.id,
                  targetArea,
                  targetCardId: chosen.cardId,
                  discardCardIds: discardCostIds.length > 0 ? discardCostIds : undefined,
                }
              );
            } else if (isMock) {
              const isSteal = cardPickerConfig.action === "steal";
              applyMockManipulation(
                target.id,
                chosen,
                isSteal,
                cardPickerConfig.cardName || (isSteal ? "PANIC!" : "CAT BALOU")
              );
              if (selectedCard) {
                const removed = new Set([selectedCard.id, ...discardCostIds]);
                setMyHand((prev) => prev.filter((c) => !removed.has(c.id)));
              }
              if (cardPickerConfig.sourceGreenCardId) {
                const gId = cardPickerConfig.sourceGreenCardId;
                setMyGreenCards((prev) => prev.filter((g) => g.id !== gId));
              }
            }
            handleCancelSelection();
            setCardPickerConfig({ isOpen: false, action: "destroy" });
            onCloseForcedModal?.();
          }}
        />
      ) : null}

      <CombatLogModal
        isOpen={isCombatLogModalOpen || (isMock && forcedModal === "combat_log")}
        combatLog={state.combatLog}
        onClose={() => {
          setIsCombatLogModalOpen(false);
          onCloseForcedModal?.();
        }}
      />
    </div>
  );
};
