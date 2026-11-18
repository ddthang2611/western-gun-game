import { useCallback, useEffect, useRef, useState } from "react";
import type { InFlightCard } from "../../../types/game";
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

const VFX_COLORS: Record<VfxBeam["type"], string> = {
  bullet: "#ef4444",
  heal: "#22c55e",
  jail: "#3b82f6",
  dynamite: "#f97316",
  draw: "#fbbf24",
};

// Manage card flights, beams, and timers
export function useTableAnimations(myPlayerId: string) {
  const [flyingCards, setFlyingCards] = useState<FlyingCardItem[]>([]);
  const [ephemeralCheckCards, setEphemeralCheckCards] = useState<InFlightCard[]>([]);
  const [vfxBeams, setVfxBeams] = useState<VfxBeam[]>([]);

  const timersRef = useRef<number[]>([]);
  const vfxSeqRef = useRef(0);
  const arenaQueueUntilRef = useRef(0);
  const myPlayerIdRef = useRef(myPlayerId);

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

  const enqueueFlight = useCallback(
    (
      fromSelector: string,
      toSelector: string,
      options?: Omit<FlyingCardItem, "id" | "fromSelector" | "toSelector">
    ) => {
      const durationMs = options?.durationMs ?? 600;
      const flight: FlyingCardItem = {
        id: `flt_${Date.now()}_${Math.random()}`,
        fromSelector,
        toSelector,
        cardImage: options?.cardImage,
        faceDown: options?.faceDown,
        label: options?.label,
        durationMs,
      };
      setFlyingCards((prev) => [...prev, flight]);
      scheduleTimeout(() => {
        setFlyingCards((prev) => prev.filter((f) => f.id !== flight.id));
      }, durationMs + 120);
    },
    [scheduleTimeout]
  );

  const scheduleStaggered = useCallback(
    (fn: () => void, stepMs = 550) => {
      const now = Date.now();
      const startAt = Math.max(now, arenaQueueUntilRef.current);
      arenaQueueUntilRef.current = startAt + stepMs;
      const delay = startAt - now;
      if (delay <= 0) {
        fn();
      } else {
        scheduleTimeout(fn, delay);
      }
    },
    [scheduleTimeout]
  );

  const triggerVfx = useCallback(
    (type: VfxBeam["type"], targetId?: string, aoeHeal = false) => {
      const centerEl =
        document.querySelector('[data-flight-anchor="center-stage"]') ||
        document.querySelector(".game-table__center-stage");
      const centerRect = centerEl?.getBoundingClientRect();
      const startX = centerRect
        ? centerRect.left + centerRect.width / 2
        : window.innerWidth / 2 - 140;
      const startY = centerRect
        ? centerRect.top + centerRect.height / 2
        : window.innerHeight * 0.42;

      const beams: VfxBeam[] = [];
      const nextBeamId = (suffix: string) => {
        vfxSeqRef.current += 1;
        return `vfx_${vfxSeqRef.current}_${suffix}`;
      };

      const addHeroBeam = (suffix: string) => {
        const heroEl =
          document.querySelector('[data-flight-anchor="my-heroes"]') ||
          document.querySelector(".game-table__console-heroes");
        const heroRect = heroEl?.getBoundingClientRect();
        if (!heroRect) return;
        beams.push({
          id: nextBeamId(suffix),
          x1: startX,
          y1: startY,
          x2: heroRect.left + heroRect.width / 2,
          y2: heroRect.top + heroRect.height / 2,
          color: VFX_COLORS[type],
          type,
        });
      };

      if (type === "draw") {
        const consoleEl =
          document.querySelector('[data-flight-anchor="my-hand"]') ||
          document.querySelector(".game-table__console-hand");
        const consoleRect = consoleEl?.getBoundingClientRect();
        const endX = consoleRect
          ? consoleRect.left + consoleRect.width / 2
          : window.innerWidth / 2;
        const endY = consoleRect ? consoleRect.top + 30 : window.innerHeight - 100;
        beams.push({
          id: nextBeamId("draw"),
          x1: startX,
          y1: startY - 20,
          x2: endX,
          y2: endY,
          color: VFX_COLORS.draw,
          type: "draw",
        });
      } else if (type === "heal" && aoeHeal) {
        const seats = document.querySelectorAll(
          ".opponent-seat:not(.opponent-seat--dead)"
        );
        seats.forEach((seat, idx) => {
          const rect = seat.getBoundingClientRect();
          beams.push({
            id: nextBeamId(`heal_${idx}`),
            x1: startX,
            y1: startY,
            x2: rect.left + rect.width / 2,
            y2: rect.top + rect.height / 2,
            color: VFX_COLORS.heal,
            type: "heal",
          });
        });
        addHeroBeam("me_heal");
      } else if (targetId) {
        if (targetId === myPlayerIdRef.current) {
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
              color: VFX_COLORS[type],
              type,
            });
          }
        }
      } else if (type === "heal") {
        addHeroBeam("self_heal");
      } else {
        const seats = document.querySelectorAll(
          ".opponent-seat:not(.opponent-seat--dead)"
        );
        seats.forEach((seat, idx) => {
          const rect = seat.getBoundingClientRect();
          beams.push({
            id: nextBeamId(`aoe_${idx}`),
            x1: startX,
            y1: startY,
            x2: rect.left + rect.width / 2,
            y2: rect.top + rect.height / 2,
            color: VFX_COLORS[type],
            type,
          });
        });
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

  const addEphemeralCards = useCallback((entries: InFlightCard[]) => {
    if (entries.length === 0) return;
    setEphemeralCheckCards((prev) => [...prev, ...entries]);
  }, []);

  const removeEphemeralCards = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    setEphemeralCheckCards((prev) => prev.filter((c) => !ids.has(c.id)));
  }, []);

  return {
    flyingCards,
    ephemeralCheckCards,
    vfxBeams,
    arenaQueueUntilRef,
    scheduleTimeout,
    enqueueFlight,
    scheduleStaggered,
    triggerVfx,
    addEphemeralCards,
    removeEphemeralCards,
  };
}
