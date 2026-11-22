import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import "./DebouncedPopover.scss";

export interface DebouncedPopoverProps {
  content: React.ReactNode;
  title?: string;
  delayMs?: number;
  children: React.ReactNode;
  position?: "top" | "bottom" | "auto";
  className?: string;
}

export const DebouncedPopover: React.FC<DebouncedPopoverProps> = ({
  content,
  title,
  delayMs = 300,
  children,
  position = "auto",
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number; placeAbove: boolean }>({
    x: 0,
    y: 0,
    placeAbove: true,
  });

  const tooltipId = useId();
  const timerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initialPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    timerRef.current = window.setTimeout(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const canPlaceAbove = rect.top >= 175;
      const placeAbove =
        position === "top"
          ? canPlaceAbove
          : position === "bottom"
          ? false
          : canPlaceAbove && (rect.bottom + 170 > window.innerHeight || rect.top > window.innerHeight * 0.48);

      setPortalTarget(containerRef.current.closest("dialog") || document.body);
      setCoords({
        x: Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150),
        y: placeAbove ? Math.max(rect.top - 8, 12) : Math.min(rect.bottom + 8, window.innerHeight - 16),
        placeAbove,
      });
      setIsVisible(true);
    }, delayMs);
  }, [delayMs, position]);

  const handleClose = useCallback(() => {
    clearTimer();
    initialPosRef.current = null;
    setIsVisible(false);
  }, [clearTimer]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    clearTimer();
    initialPosRef.current = { x: e.clientX, y: e.clientY };
    scheduleOpen();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!initialPosRef.current || isVisible) return;
    const dx = Math.abs(e.clientX - initialPosRef.current.x);
    const dy = Math.abs(e.clientY - initialPosRef.current.y);

    if (dx > 25 || dy > 25) {
      initialPosRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      scheduleOpen();
    }
  };

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!isVisible || !panel) return;
    panel.style.setProperty("--popover-x", `${coords.x}px`);
    panel.style.setProperty("--popover-y", `${coords.y}px`);
    const rect = panel.getBoundingClientRect();
    const margin = 12;
    const halfW = rect.width / 2;
    const clampedX = Math.min(
      Math.max(coords.x, halfW + margin),
      Math.max(halfW + margin, window.innerWidth - halfW - margin)
    );
    let clampedY = coords.y;
    if (coords.placeAbove && rect.top < margin) {
      clampedY = coords.y + (margin - rect.top);
    } else if (!coords.placeAbove && rect.bottom > window.innerHeight - margin) {
      clampedY = Math.max(margin, coords.y - (rect.bottom - (window.innerHeight - margin)));
    }
    panel.style.setProperty("--popover-x", `${clampedX}px`);
    panel.style.setProperty("--popover-y", `${clampedY}px`);
  }, [isVisible, portalTarget, coords.x, coords.y, coords.placeAbove]);

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isVisible, handleClose]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const popoverPanel = isVisible && portalTarget && (
    <div
      ref={panelRef}
      id={tooltipId}
      role="tooltip"
      className={`ui-popover__panel ${
        coords.placeAbove ? "ui-popover__panel--above" : "ui-popover__panel--below"
      }`}
    >
      {title && <div className="ui-popover__title">{title}</div>}
      <div>{content}</div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      aria-describedby={isVisible ? tooltipId : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleClose}
      onFocus={() => {
        clearTimer();
        scheduleOpen();
      }}
      onBlur={handleClose}
      className={`ui-popover ${className}`.trim()}
    >
      {children}
      {popoverPanel && portalTarget && createPortal(popoverPanel, portalTarget)}
    </div>
  );
};
