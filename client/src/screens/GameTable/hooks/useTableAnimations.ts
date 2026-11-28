import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArenaCardEntry,
  ArenaChainState,
  InFlightCard,
} from "../../../types/game";
import { resolveEquipmentSlotKey } from "../../../utils/equipments";
import type { FlyingCardItem } from "../components/CardFlightLayer";

export interface VfxBeam {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  type: "bullet" | "heal" | "jail" | "dynamite" | "draw";
}

export const ARENA_FLIGHT_MS = 720;
export const ARENA_BATCH_STAGGER_MS = 480;
export const ARENA_EXIT_MS = 260;
export const PLACEMENT_RETURN_MS = 680;

const ARENA_ANCHOR = '[data-flight-anchor="card-arena"], .inflight-chain';
const DRAW_PILE_ANCHOR = '[data-flight-anchor="draw-pile"], .game-table__pile-card--stack';
const DISCARD_PILE_ANCHOR =
  '[data-flight-anchor="discard-pile"], .game-table__pile-card--discard';
const MY_HAND_ANCHOR =
  '[data-flight-anchor="my-hand-last"], [data-flight-anchor="my-hand"], .game-table__console-hand';
const MY_GREEN_ANCHOR = '[data-flight-anchor="my-green"], .game-table__console-green';
const MY_EQUIP_ANCHOR = '[data-flight-anchor="my-equip"], .game-table__console-equipments';
const MY_HERO_ANCHOR = '[data-flight-anchor="my-heroes"], .game-table__console-heroes';
const MY_JUDGEMENT_ANCHOR =
  '[data-flight-anchor="my-judgements"], [data-flight-anchor="my-heroes"], .game-table__console-heroes';

const VFX_COLORS: Record<VfxBeam["type"], string> = {
  bullet: "#ef4444",
  heal: "#22c55e",
  jail: "#3b82f6",
  dynamite: "#f97316",
  draw: "#fbbf24",
};

function normImg(img?: string): string | undefined {
  if (!img) return undefined;
  return img.startsWith("/") || img.startsWith("http") ? img : `/${img}`;
}

function resolveOriginAnchor(entry: ArenaCardEntry, myPlayerId: string): string {
  const isMe = Boolean(myPlayerId && entry.actorPlayerId === myPlayerId);
  const seat = entry.actorPlayerId ? `#seat-${entry.actorPlayerId}` : MY_HAND_ANCHOR;

  switch (entry.originZone) {
    case "DECK":
      return DRAW_PILE_ANCHOR;
    case "DISCARD":
      return DISCARD_PILE_ANCHOR;
    case "GREEN":
      return isMe
        ? MY_GREEN_ANCHOR
        : `[data-flight-anchor="opp-green-${entry.actorPlayerId}"], ${seat}`;
    case "EQUIPMENT": {
      const slotKey = entry.originSlotKey || resolveEquipmentSlotKey(entry.card);
      return isMe
        ? `[data-flight-anchor="my-equip-${slotKey}"], ${MY_EQUIP_ANCHOR}`
        : `[data-flight-anchor="opp-equip-${entry.actorPlayerId}-${slotKey}"], [data-flight-anchor="opp-equip-${entry.actorPlayerId}"], ${seat}`;
    }
    case "JUDGEMENT":
      return isMe ? MY_JUDGEMENT_ANCHOR : seat;
    case "HERO":
      return isMe ? MY_HERO_ANCHOR : seat;
    case "EVENT":
      return ARENA_ANCHOR;
    case "HAND":
    default:
      return isMe ? MY_HAND_ANCHOR : seat;
  }
}

function resolveDestinationAnchor(entry: ArenaCardEntry, myPlayerId: string): string | null {
  const destPlayerId = entry.destinationPlayerId || entry.actorPlayerId;
  const isMe = Boolean(myPlayerId && destPlayerId === myPlayerId);
  const seat = destPlayerId ? `#seat-${destPlayerId}` : MY_HAND_ANCHOR;

  if (entry.destinationZone === "EQUIPMENT") {
    const slotKey = entry.destinationSlotKey || resolveEquipmentSlotKey(entry.card);
    return isMe
      ? `[data-flight-anchor="my-equip-${slotKey}"], ${MY_EQUIP_ANCHOR}`
      : `[data-flight-anchor="opp-equip-${destPlayerId}-${slotKey}"], [data-flight-anchor="opp-equip-${destPlayerId}"], ${seat}`;
  }
  if (entry.destinationZone === "GREEN") {
    return isMe
      ? MY_GREEN_ANCHOR
      : `[data-flight-anchor="opp-green-${destPlayerId}"], ${seat}`;
  }
  if (entry.destinationZone === "JUDGEMENT") {
    return isMe ? MY_JUDGEMENT_ANCHOR : seat;
  }
  if (entry.destinationZone === "HAND" && entry.kind === "REVEAL_CARD") {
    return isMe ? MY_HAND_ANCHOR : seat;
  }
  return null;
}

function hasRenderableBox(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveCharacterPoint(
  playerId: string | undefined,
  myId: string
): { x: number; y: number } | null {
  const candidates: Array<HTMLElement | null> =
    !playerId || playerId === myId
      ? [
          document.querySelector<HTMLElement>('[data-target-origin="player"]'),
          document.querySelector<HTMLElement>(MY_HERO_ANCHOR),
          document.querySelector<HTMLElement>(".game-table__console-heroes"),
        ]
      : [
          document.querySelector<HTMLElement>(
            `#seat-${playerId} .opponent-seat__hero-columns`
          ),
          document.getElementById(`seat-${playerId}`),
        ];

  const targetEl = candidates.find(hasRenderableBox);
  if (!targetEl) return null;
  const rect = targetEl.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isBoardPlacementEntry(entry: ArenaCardEntry): boolean {
  if (entry.kind === "EQUIP_PLACEMENT") return true;
  if (
    entry.kind === "CHECK_SOURCE" &&
    entry.destinationZone === "JUDGEMENT" &&
    Boolean(entry.destinationPlayerId)
  ) {
    return true;
  }
  return false;
}

function toInFlightCard(entry: ArenaCardEntry): InFlightCard {
  return {
    id: entry.id,
    card: {
      ...entry.card,
      image: normImg(entry.card.image),
    },
    sourcePlayerName: entry.actorPlayerName,
    targetPlayerName: entry.targetPlayerName,
    actionText: entry.actionLabel,
    kind: entry.kind,
    outcome: entry.outcome,
  };
}

// Manage card flights, arena resolution synchronization, beams, and timers
export function useTableAnimations(
  myPlayerId: string,
  arenaChain?: ArenaChainState
) {
  const [flyingCards, setFlyingCards] = useState<FlyingCardItem[]>([]);
  const [concealedHandCardIds, setConcealedHandCardIds] = useState<string[]>([]);
  const [returningInPlayCardIds, setReturningInPlayCardIds] = useState<string[]>([]);
  const [vfxBeams, setVfxBeams] = useState<VfxBeam[]>([]);
  const [landedEntryIds, setLandedEntryIds] = useState<string[]>(() =>
    (arenaChain?.entries || []).map((e) => e.id)
  );
  const [exitingCards, setExitingCards] = useState<InFlightCard[]>([]);
  const [pendingReadPauseCount, setPendingReadPauseCount] = useState(0);
  const [isPlacementReturning, setIsPlacementReturning] = useState(false);

  const timersRef = useRef<number[]>([]);
  const vfxSeqRef = useRef(0);
  const myHandFlightEndAtRef = useRef(0);
  const myPlayerIdRef = useRef(myPlayerId);
  const prevArenaRef = useRef<{
    initialized: boolean;
    chainId: string;
    entries: ArenaCardEntry[];
  }>({
    initialized: false,
    chainId: arenaChain?.chainId ?? "",
    entries: arenaChain?.entries ?? [],
  });

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const scheduleTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  const resetAnimations = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setFlyingCards([]);
    setConcealedHandCardIds([]);
    setReturningInPlayCardIds([]);
    setVfxBeams([]);
    setLandedEntryIds([]);
    setExitingCards([]);
    setPendingReadPauseCount(0);
    setIsPlacementReturning(false);
    prevArenaRef.current = { initialized: false, chainId: "", entries: [] };
  }, []);

  const enqueueFlight = useCallback(
    (
      fromSelector: string,
      toSelector: string,
      options?: Omit<FlyingCardItem, "id" | "fromSelector" | "toSelector">
    ) => {
      const durationMs = options?.durationMs ?? ARENA_FLIGHT_MS;
      if (toSelector.includes("my-hand")) {
        const endAt = Date.now() + durationMs;
        if (endAt > myHandFlightEndAtRef.current) {
          myHandFlightEndAtRef.current = endAt;
        }
      }
      const flight: FlyingCardItem = {
        id: `flt_${Date.now()}_${Math.random()}`,
        fromSelector,
        toSelector,
        cardImage: options?.cardImage,
        faceDown: options?.faceDown,
        label: options?.label,
        durationMs,
        startScale: options?.startScale,
        endScale: options?.endScale,
        fadeOutAtEnd: options?.fadeOutAtEnd,
      };
      setFlyingCards((prev) => [...prev, flight]);
      scheduleTimeout(() => {
        setFlyingCards((prev) => prev.filter((f) => f.id !== flight.id));
      }, durationMs + 40);
    },
    [scheduleTimeout]
  );

  const concealHandCards = useCallback(
    (cardIds: string[]) => {
      if (cardIds.length === 0) return;
      const idSet = new Set(cardIds);
      setConcealedHandCardIds((prev) => Array.from(new Set([...prev, ...cardIds])));

      // Reveal once hand flight lands
      let retriedForArena = false;
      const revealWhenLanded = () => {
        const remaining = myHandFlightEndAtRef.current - Date.now();
        if (remaining > 40) {
          retriedForArena = true;
          scheduleTimeout(revealWhenLanded, Math.min(remaining + 30, 1600));
          return;
        }
        if (!retriedForArena) {
          retriedForArena = true;
          scheduleTimeout(revealWhenLanded, ARENA_FLIGHT_MS + 120);
          return;
        }
        setConcealedHandCardIds((prev) => prev.filter((id) => !idSet.has(id)));
      };
      scheduleTimeout(revealWhenLanded, 120);
    },
    [scheduleTimeout]
  );

  const triggerVfx = useCallback(
    (type: VfxBeam["type"], targetId?: string, aoeHeal = false, sourceId?: string) => {
      if (type === "draw") return;

      const myId = myPlayerIdRef.current;
      const beams: VfxBeam[] = [];
      const nextBeamId = (suffix: string) => {
        vfxSeqRef.current += 1;
        return `vfx_${vfxSeqRef.current}_${suffix}`;
      };

      const pushBeam = (
        suffix: string,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        beams.push({
          id: nextBeamId(suffix),
          x1,
          y1,
          x2,
          y2,
          color: VFX_COLORS[type],
          type,
        });
      };

      if (targetId && !aoeHeal) {
        const dstPt = resolveCharacterPoint(targetId, myId);
        if (!dstPt) return;

        if (!sourceId || sourceId === targetId) {
          pushBeam("self", dstPt.x, dstPt.y, dstPt.x, dstPt.y);
        } else {
          const srcPt = resolveCharacterPoint(sourceId, myId);
          if (!srcPt) return;
          pushBeam("single", srcPt.x, srcPt.y, dstPt.x, dstPt.y);
        }
      } else {
        const srcPt = sourceId ? resolveCharacterPoint(sourceId, myId) : null;
        if (sourceId && !srcPt) return;

        const targetIds = Array.from(
          document.querySelectorAll<HTMLElement>(".opponent-seat:not(.opponent-seat--dead)")
        )
          .map((seat) => seat.id.replace(/^seat-/, ""))
          .filter((id) => Boolean(id) && id !== sourceId);

        if (myId && myId !== sourceId) {
          targetIds.push(myId);
        }

        for (const tid of targetIds) {
          const dstPt = resolveCharacterPoint(tid, myId);
          if (!dstPt) continue;
          if (srcPt) {
            pushBeam(`aoe_${tid}`, srcPt.x, srcPt.y, dstPt.x, dstPt.y);
          } else {
            pushBeam(`pulse_${tid}`, dstPt.x, dstPt.y, dstPt.x, dstPt.y);
          }
        }

        if (type === "heal" && srcPt) {
          pushBeam("actor_heal", srcPt.x, srcPt.y, srcPt.x, srcPt.y);
        }
      }

      if (beams.length > 0) {
        setVfxBeams((prev) => [...prev, ...beams]);
        scheduleTimeout(() => {
          setVfxBeams((prev) =>
            prev.filter((b) => !beams.some((nb) => nb.id === b.id))
          );
        }, 700);
      }
    },
    [scheduleTimeout]
  );

  // Synchronize Card Arena flights, VFX, and placement return flights against authoritative arenaChain
  useEffect(() => {
    const prev = prevArenaRef.current;
    const nextEntries = arenaChain?.entries ?? [];
    const nextChainId = arenaChain?.chainId ?? "";
    const myId = myPlayerIdRef.current;

    if (!prev.initialized) {
      if (nextEntries.length > 0) {
        scheduleTimeout(() => {
          setLandedEntryIds(nextEntries.map((e) => e.id));
        }, 0);
      }
      prevArenaRef.current = {
        initialized: true,
        chainId: nextChainId,
        entries: nextEntries,
      };
      return;
    }

    const prevChainEnded =
      prev.entries.length > 0 &&
      (nextEntries.length === 0 || (nextChainId !== "" && nextChainId !== prev.chainId));

    if (prevChainEnded) {
      const placementReturns: ArenaCardEntry[] = [];
      const nonPlacementCleared: ArenaCardEntry[] = [];

      for (const oldEntry of prev.entries) {
        const destAnchor = resolveDestinationAnchor(oldEntry, myId);
        if (destAnchor) {
          placementReturns.push(oldEntry);
        } else {
          nonPlacementCleared.push(oldEntry);
        }
      }

      if (placementReturns.length > 0) {
        const returnIds = placementReturns.map((e) => e.card.id);
        scheduleTimeout(() => {
          setReturningInPlayCardIds((curr) => Array.from(new Set([...curr, ...returnIds])));
          setIsPlacementReturning(true);
        }, 0);

        placementReturns.forEach((entry, idx) => {
          const destAnchor = resolveDestinationAnchor(entry, myId);
          if (!destAnchor) return;
          const isHandReturn = entry.destinationZone === "HAND";
          scheduleTimeout(() => {
            enqueueFlight(ARENA_ANCHOR, destAnchor, {
              faceDown: false,
              cardImage: normImg(entry.card.image),
              label: entry.card.name,
              durationMs: PLACEMENT_RETURN_MS,
              startScale: 1,
              endScale: isHandReturn ? 0.9 : 0.45,
              fadeOutAtEnd: true,
            });
          }, idx * 80);
        });

        const totalReturnMs = (placementReturns.length - 1) * 80 + PLACEMENT_RETURN_MS;
        scheduleTimeout(() => {
          const idSet = new Set(returnIds);
          setReturningInPlayCardIds((curr) => curr.filter((id) => !idSet.has(id)));
          setIsPlacementReturning(false);
        }, totalReturnMs);
      }

      if (nonPlacementCleared.length > 0 && nextEntries.length === 0) {
        const exitingSnapshot = nonPlacementCleared.map(toInFlightCard);
        scheduleTimeout(() => {
          setExitingCards(exitingSnapshot);
        }, 0);
        scheduleTimeout(() => {
          setExitingCards((curr) => (curr === exitingSnapshot ? [] : curr));
        }, ARENA_EXIT_MS);
      } else {
        scheduleTimeout(() => {
          setExitingCards([]);
        }, 0);
      }
    }

    const prevIdSet =
      prev.chainId === nextChainId
        ? new Set(prev.entries.map((e) => e.id))
        : new Set<string>();
    const newlyAdded = nextEntries.filter((e) => !prevIdSet.has(e.id));

    if (nextEntries.length === 0) {
      if (prev.entries.length > 0) {
        scheduleTimeout(() => {
          setLandedEntryIds([]);
          setPendingReadPauseCount(0);
        }, 0);
      }
    } else if (newlyAdded.length > 0) {
      const resetPrevLanded = prev.chainId !== nextChainId;
      scheduleTimeout(() => {
        if (resetPrevLanded) {
          setLandedEntryIds([]);
        }
        setExitingCards([]);
      }, 0);

      newlyAdded.forEach((entry, idx) => {
        const launchDelay = idx * ARENA_BATCH_STAGGER_MS;
        const fromAnchor = resolveOriginAnchor(entry, myId);
        const isSmallOrigin =
          entry.originZone === "EQUIPMENT" ||
          entry.originZone === "GREEN" ||
          entry.originZone === "JUDGEMENT";

        scheduleTimeout(() => {
          enqueueFlight(fromAnchor, ARENA_ANCHOR, {
            faceDown: false,
            cardImage: normImg(entry.card.image),
            label: entry.card.name,
            durationMs: ARENA_FLIGHT_MS,
            startScale: isSmallOrigin ? 0.55 : 0.9,
            endScale: 1,
            fadeOutAtEnd: false,
          });
        }, launchDelay);

        scheduleTimeout(() => {
          setLandedEntryIds((curr) =>
            curr.includes(entry.id) ? curr : [...curr, entry.id]
          );
          setPendingReadPauseCount((c) => c + 1);
          if (entry.vfxType) {
            triggerVfx(
              entry.vfxType,
              entry.vfxTargetId,
              Boolean(entry.vfxAoe),
              entry.actorPlayerId
            );
          }
          const readPauseMs = entry.kind === "CHECK_RESULT" ? 750 : 220;
          scheduleTimeout(() => {
            setPendingReadPauseCount((c) => Math.max(0, c - 1));
          }, readPauseMs);
        }, launchDelay + ARENA_FLIGHT_MS);
      });
    } else if ((arenaChain?.stepLockRemainingMs ?? 0) === 0) {
      // Reconcile landed arena entries
      scheduleTimeout(() => {
        const allIds = nextEntries.map((e) => e.id);
        setLandedEntryIds((curr) =>
          allIds.every((id) => curr.includes(id))
            ? curr
            : Array.from(new Set([...curr, ...allIds]))
        );
        setPendingReadPauseCount(0);
      }, 0);
    }

    prevArenaRef.current = {
      initialized: true,
      chainId: nextChainId,
      entries: nextEntries,
    };
  }, [arenaChain, enqueueFlight, scheduleTimeout, triggerVfx]);

  const concealedInPlayCardIds = useMemo(() => {
    const ids = new Set<string>(returningInPlayCardIds);
    for (const entry of arenaChain?.entries || []) {
      if (isBoardPlacementEntry(entry)) {
        ids.add(entry.card.id);
      }
    }
    return Array.from(ids);
  }, [arenaChain?.entries, returningInPlayCardIds]);

  const activeRevealHandIds = useMemo(() => {
    const ids: string[] = [];
    for (const entry of arenaChain?.entries || []) {
      if (
        entry.kind === "REVEAL_CARD" &&
        entry.destinationZone === "HAND" &&
        entry.destinationPlayerId === myPlayerId
      ) {
        ids.push(entry.card.id);
      }
    }
    return ids;
  }, [arenaChain?.entries, myPlayerId]);

  const combinedHiddenHandIds = useMemo(
    () =>
      Array.from(
        new Set([...concealedHandCardIds, ...activeRevealHandIds])
      ),
    [concealedHandCardIds, activeRevealHandIds]
  );

  const landedSet = useMemo(() => new Set(landedEntryIds), [landedEntryIds]);

  const visibleArenaCards: InFlightCard[] = useMemo(() => {
    const entries = arenaChain?.entries || [];
    if (entries.length > 0) {
      return entries.filter((e) => landedSet.has(e.id)).map(toInFlightCard);
    }
    return exitingCards;
  }, [arenaChain?.entries, exitingCards, landedSet]);

  const hasUnlandedEntries = useMemo(
    () => (arenaChain?.entries || []).some((e) => !landedSet.has(e.id)),
    [arenaChain?.entries, landedSet]
  );

  const isArenaExiting =
    (arenaChain?.entries?.length ?? 0) === 0 && exitingCards.length > 0;
  const isStepAnimating = hasUnlandedEntries || pendingReadPauseCount > 0;
  const isArenaBlockingActions =
    Boolean(
      arenaChain &&
        (arenaChain.status !== "IDLE" || arenaChain.entries.length > 0)
    ) ||
    isArenaExiting ||
    isPlacementReturning;

  return {
    flyingCards,
    visibleArenaCards,
    isArenaExiting,
    isStepAnimating,
    isArenaBlockingActions,
    concealedHandCardIds: combinedHiddenHandIds,
    concealedInPlayCardIds,
    vfxBeams,
    scheduleTimeout,
    enqueueFlight,
    concealHandCards,
    triggerVfx,
    resetAnimations,
  };
}
