import React, { useId } from "react";
import type { VfxBeam } from "../hooks/useTableAnimations";
import "./VfxLayer.scss";

export interface VfxLayerProps {
  beams: VfxBeam[];
}

const VFX_MARKERS = [
  { type: "bullet", color: "#ef4444" },
  { type: "heal", color: "#22c55e" },
  { type: "jail", color: "#3b82f6" },
  { type: "dynamite", color: "#f97316" },
  { type: "draw", color: "#fbbf24" },
] as const;

// Render character-to-character SVG VFX overlay
export const VfxLayer: React.FC<VfxLayerProps> = ({ beams }) => {
  const uid = useId().replace(/:/g, "");
  const glowId = `vfx-glow-${uid}`;

  return (
    <svg className="game-table__vfx-canvas" aria-hidden="true">
      <defs>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {VFX_MARKERS.map((m) => (
          <marker
            key={m.type}
            id={`vfx-arrow-${uid}-${m.type}`}
            viewBox="0 0 12 12"
            refX="8"
            refY="6"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 1 1 L 11 6 L 1 11 L 3.5 6 Z" fill={m.color} />
          </marker>
        ))}
      </defs>
      {beams.map((beam) => {
        const hasTravel = Math.hypot(beam.x2 - beam.x1, beam.y2 - beam.y1) > 4;
        return (
          <g key={beam.id}>
            {hasTravel && (
              <line
                x1={beam.x1}
                y1={beam.y1}
                x2={beam.x2}
                y2={beam.y2}
                stroke={beam.color}
                strokeWidth="4"
                strokeDasharray="10 6"
                filter={`url(#${glowId})`}
                markerEnd={`url(#vfx-arrow-${uid}-${beam.type})`}
                className="game-table__vfx-line"
              />
            )}
            <circle
              cx={beam.x2}
              cy={beam.y2}
              r="8"
              fill={beam.color}
              className="game-table__vfx-impact"
            />
          </g>
        );
      })}
    </svg>
  );
};
