import React, { useId, useLayoutEffect, useRef } from "react";
import "./TargetingArrow.scss";

export interface TargetingArrowProps {
  sourcePlayerId?: string | null;
  targetPlayerId: string | null;
  myPlayerId?: string | null;
  hasSourceSelection: boolean;
  isSkillOrigin?: boolean;
}

function hasRenderableBox(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveOpponentCharacter(playerId: string): HTMLElement | null {
  const portraitBox = document.querySelector<HTMLElement>(
    `#seat-${playerId} .opponent-seat__hero-columns`
  );
  if (hasRenderableBox(portraitBox)) return portraitBox;
  const seatBox = document.getElementById(`seat-${playerId}`);
  return hasRenderableBox(seatBox) ? seatBox : null;
}

function resolvePlayerOrigin(
  sourcePlayerId?: string | null,
  myPlayerId?: string | null
): HTMLElement | null {
  if (sourcePlayerId && (!myPlayerId || sourcePlayerId !== myPlayerId)) {
    const oppChar = resolveOpponentCharacter(sourcePlayerId);
    if (oppChar) return oppChar;
  }

  const candidates = [
    document.querySelector<HTMLElement>('[data-target-origin="player"]'),
    document.querySelector<HTMLElement>('[data-flight-anchor="my-heroes"]'),
    document.querySelector<HTMLElement>(".game-table__console-heroes"),
  ];
  return candidates.find(hasRenderableBox) ?? null;
}

function resolveTargetSeat(
  targetPlayerId: string,
  myPlayerId?: string | null
): HTMLElement | null {
  if (myPlayerId && targetPlayerId === myPlayerId) {
    return resolvePlayerOrigin(myPlayerId, myPlayerId);
  }
  return resolveOpponentCharacter(targetPlayerId);
}

export const TargetingArrow: React.FC<TargetingArrowProps> = ({
  sourcePlayerId,
  targetPlayerId,
  myPlayerId,
  hasSourceSelection,
  isSkillOrigin = false,
}) => {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const glowPathRef = useRef<SVGPathElement | null>(null);
  const mainPathRef = useRef<SVGPathElement | null>(null);
  const originDotRef = useRef<SVGCircleElement | null>(null);
  const reticleRef = useRef<SVGCircleElement | null>(null);

  const isActive = Boolean(targetPlayerId && (hasSourceSelection || isSkillOrigin));

  useLayoutEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !isActive || !targetPlayerId) return;

    const updateArrow = () => {
      const targetEl = resolveTargetSeat(targetPlayerId, myPlayerId);
      const sourceEl = resolvePlayerOrigin(sourcePlayerId, myPlayerId);

      if (!targetEl || !sourceEl || sourceEl === targetEl) {
        svgEl.setAttribute("data-visible", "false");
        return;
      }

      const srcRect = sourceEl.getBoundingClientRect();
      const dstRect = targetEl.getBoundingClientRect();
      const x1 = srcRect.left + srcRect.width / 2;
      const y1 = srcRect.top + srcRect.height / 2;
      const x2 = dstRect.left + dstRect.width / 2;
      const y2 = dstRect.top + dstRect.height / 2;

      const d = `M ${x1} ${y1} L ${x2} ${y2}`;
      glowPathRef.current?.setAttribute("d", d);
      mainPathRef.current?.setAttribute("d", d);
      originDotRef.current?.setAttribute("cx", String(x1));
      originDotRef.current?.setAttribute("cy", String(y1));
      reticleRef.current?.setAttribute("cx", String(x2));
      reticleRef.current?.setAttribute("cy", String(y2));
      svgEl.setAttribute("data-visible", "true");
    };

    updateArrow();
    window.addEventListener("resize", updateArrow);
    window.addEventListener("scroll", updateArrow, true);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      const sourceEl = resolvePlayerOrigin(sourcePlayerId, myPlayerId);
      const targetEl = resolveTargetSeat(targetPlayerId, myPlayerId);
      observer = new ResizeObserver(updateArrow);
      if (sourceEl) observer.observe(sourceEl);
      if (targetEl) observer.observe(targetEl);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateArrow);
      window.removeEventListener("scroll", updateArrow, true);
    };
  }, [isActive, sourcePlayerId, targetPlayerId, myPlayerId, hasSourceSelection, isSkillOrigin]);

  if (!isActive) return null;

  const markerId = `target-head-${uid}`;
  const gradId = `target-grad-${uid}`;

  return (
    <svg
      ref={svgRef}
      data-visible="false"
      className="game-table__targeting-arrow"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <marker
          id={markerId}
          viewBox="0 0 12 12"
          refX="9"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M 1 1 L 11 6 L 1 11 L 3.5 6 Z" fill="#fde047" />
        </marker>
      </defs>
      <path ref={glowPathRef} className="game-table__targeting-glow" />
      <path
        ref={mainPathRef}
        stroke={`url(#${gradId})`}
        markerEnd={`url(#${markerId})`}
        className="game-table__targeting-path"
      />
      <circle ref={originDotRef} r="5" className="game-table__targeting-origin" />
      <circle ref={reticleRef} r="14" className="game-table__targeting-reticle" />
    </svg>
  );
};
