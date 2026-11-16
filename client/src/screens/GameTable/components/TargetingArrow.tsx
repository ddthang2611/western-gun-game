import React, { useId, useLayoutEffect, useRef } from "react";

export interface TargetingArrowProps {
  targetPlayerId: string | null;
  hasSourceSelection: boolean;
  isSkillOrigin?: boolean;
}

export const TargetingArrow: React.FC<TargetingArrowProps> = ({
  targetPlayerId,
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
      const targetEl = document.getElementById(`seat-${targetPlayerId}`);
      const sourceEl = isSkillOrigin
        ? document.querySelector<HTMLElement>(".game-table__btn--skill-confirm") ||
          document.querySelector<HTMLElement>(".game-table__btn--skill")
        : document.querySelector<HTMLElement>(".game-table__hand-card-wrapper--selected") ||
          document.querySelector<HTMLElement>(".game-table__green-slot--selected");

      if (!targetEl || !sourceEl) {
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
    return () => {
      window.removeEventListener("resize", updateArrow);
      window.removeEventListener("scroll", updateArrow, true);
    };
  }, [isActive, targetPlayerId, hasSourceSelection, isSkillOrigin]);

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
