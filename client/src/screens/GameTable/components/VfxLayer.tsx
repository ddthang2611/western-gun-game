import React from "react";
import type { VfxBeam } from "../hooks/useTableAnimations";
import "./VfxLayer.scss";

export interface VfxLayerProps {
  beams: VfxBeam[];
}

// Render temporary SVG beam VFX overlay
export const VfxLayer: React.FC<VfxLayerProps> = ({ beams }) => {
  return (
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
      {beams.map((beam) => (
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
  );
};
