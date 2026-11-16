import React, { useEffect, useRef } from "react";
import "./BulletMeter.scss";

export type BulletMeterSize = "small" | "medium" | "large";
export type BulletMeterOrientation = "horizontal" | "vertical";

export interface BulletMeterProps {
  currentHp: number;
  maxHp: number;
  size?: BulletMeterSize;
  orientation?: BulletMeterOrientation;
  showText?: boolean;
}

const SIZE_DIMENSIONS: Record<BulletMeterSize, { width: number; height: number }> = {
  small: { width: 14, height: 30 },
  medium: { width: 22, height: 48 },
  large: { width: 26, height: 54 },
};

export const BulletMeter: React.FC<BulletMeterProps> = ({
  currentHp,
  maxHp,
  size = "medium",
  orientation = "horizontal",
  showText = false,
}) => {
  const slotCount = Math.max(0, maxHp);
  const clampedHp = Math.max(0, Math.min(currentHp, slotCount));
  const isNearDeath = clampedHp <= 1 && clampedHp > 0;
  const hpSummary = `${clampedHp} of ${slotCount} HP${isNearDeath ? ", near death" : ""}`;
  const { width, height } = SIZE_DIMENSIONS[size];

  const prevHpRef = useRef(clampedHp);
  const bulletRefs = useRef<(HTMLImageElement | null)[]>([]);

  // Animate bullets changed since update
  useEffect(() => {
    const prevHp = prevHpRef.current;
    prevHpRef.current = clampedHp;
    if (prevHp === clampedHp) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const startIdx = Math.min(prevHp, clampedHp);
    const endIdx = Math.max(prevHp, clampedHp);
    const isHealing = clampedHp > prevHp;
    const activeAnims: Animation[] = [];

    for (let i = startIdx; i < endIdx; i += 1) {
      const el = bulletRefs.current[i];
      if (!el || typeof el.animate !== "function") continue;
      const keyframes = isHealing
        ? [
            { transform: "rotate(-34deg) scale(0.75)", opacity: 0.45 },
            { transform: "rotate(-34deg) scale(1.22)", opacity: 1 },
            { transform: "rotate(-34deg) scale(1)", opacity: 1 },
          ]
        : [
            { transform: "rotate(-34deg) scale(1.22)", opacity: 1 },
            { transform: "rotate(-34deg) scale(0.9)", opacity: 0.55 },
            { transform: "rotate(-34deg) scale(1)", opacity: 0.55 },
          ];
      activeAnims.push(
        el.animate(keyframes, {
          duration: 520,
          iterations: 2,
          easing: "ease-out",
        })
      );
    }

    return () => {
      activeAnims.forEach((anim) => anim.cancel());
    };
  }, [clampedHp]);

  return (
    <div
      className={`bullet-meter ${
        orientation === "vertical" ? "bullet-meter--vertical" : ""
      }`.trim()}
    >
      <div className="bullet-meter__bullets" role="img" aria-label={hpSummary}>
        {Array.from({ length: slotCount }).map((_, index) => {
          const isFilled = index < clampedHp;
          const bulletClass = [
            "bullet-meter__bullet",
            `bullet-meter__bullet--${size}`,
            isFilled ? "bullet-meter__bullet--filled" : "bullet-meter__bullet--empty",
            isFilled && isNearDeath ? "bullet-meter__bullet--near-death" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <img
              key={index}
              ref={(el) => {
                bulletRefs.current[index] = el;
              }}
              src={
                isFilled
                  ? "/assets/images/ui/bullet_hp_full.png"
                  : "/assets/images/ui/bullet_hp_lost.png"
              }
              alt=""
              width={width}
              height={height}
              decoding="async"
              draggable={false}
              className={bulletClass}
            />
          );
        })}
      </div>
      {showText && (
        <span
          aria-hidden="true"
          className={`bullet-meter__text bullet-meter__text--${size} ${
            isNearDeath ? "bullet-meter__text--near-death" : ""
          }`.trim()}
        >
          {clampedHp}/{slotCount}
        </span>
      )}
    </div>
  );
};
