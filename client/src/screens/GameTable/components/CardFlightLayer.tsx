import React, { useLayoutEffect, useRef } from "react";
import "./CardFlightLayer.scss";

export interface FlyingCardItem {
  id: string;
  fromSelector: string;
  toSelector: string;
  cardImage?: string;
  faceDown?: boolean;
  label?: string;
  durationMs?: number;
}

interface FlightNodeProps {
  item: FlyingCardItem;
}

const getElementCenter = (selector: string): { x: number; y: number } | null => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

const FlightNode: React.FC<FlightNodeProps> = ({ item }) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = nodeRef.current;
    if (!el) return;

    const from = getElementCenter(item.fromSelector);
    const to = getElementCenter(item.toSelector);
    if (!from || !to) {
      el.style.opacity = "0";
      return;
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const duration = item.durationMs ?? 600;

    el.style.left = `${from.x}px`;
    el.style.top = `${from.y}px`;
    el.style.transition = "none";
    el.style.transform = "translate3d(-50%, -50%, 0) scale(0.92)";
    el.style.opacity = "1";

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        el.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${Math.round(duration * 0.35)}ms ease ${Math.round(duration * 0.65)}ms`;
        el.style.transform = `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(1)`;
        el.style.opacity = "0";
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [item]);

  const imgSrc = item.faceDown
    ? "/assets/images/ui/card_back.png"
    : item.cardImage || "/assets/images/ui/card_back.png";

  return (
    <div ref={nodeRef} className="card-flight-layer__card" aria-hidden="true">
      <img src={imgSrc} alt="" className="card-flight-layer__img" draggable={false} />
      {item.label && !item.faceDown && (
        <span className="card-flight-layer__label">{item.label}</span>
      )}
    </div>
  );
};

export interface CardFlightLayerProps {
  flights: FlyingCardItem[];
}

export const CardFlightLayer: React.FC<CardFlightLayerProps> = ({ flights }) => {
  if (flights.length === 0) return null;

  return (
    <div className="card-flight-layer" aria-hidden="true">
      {flights.map((item) => (
        <FlightNode key={item.id} item={item} />
      ))}
    </div>
  );
};
