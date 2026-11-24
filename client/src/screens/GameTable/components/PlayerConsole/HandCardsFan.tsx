import React, { useLayoutEffect, useRef } from "react";
import type { Card } from "../../../../types/game";
import { CardView } from "../../../../components/game";

export interface HandCardsFanProps {
  hand: Card[];
  selectedCardId: string | null;
  selectedCardIds?: string[];
  discardCardIds?: string[];
  concealedCardIds?: string[];
  onSelectCard: (card: Card) => void;
}

export const HandCardsFan: React.FC<HandCardsFanProps> = ({
  hand,
  selectedCardId,
  selectedCardIds,
  discardCardIds,
  concealedCardIds,
  onSelectCard,
}) => {
  const fanRef = useRef<HTMLDivElement | null>(null);
  const visibleHand = concealedCardIds?.length
    ? hand.filter((c) => !concealedCardIds.includes(c.id))
    : hand;
  const cardCount = visibleHand.length;

  useLayoutEffect(() => {
    const fanEl = fanRef.current;
    if (!fanEl) return;

    const updateOverlap = () => {
      if (cardCount <= 1) {
        fanEl.style.setProperty("--hand-overlap", "0px");
        return;
      }

      const style = window.getComputedStyle(fanEl);
      const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const availableWidth = Math.max(0, fanEl.clientWidth - paddingX);
      const gap = parseFloat(style.columnGap || style.gap) || 10;
      const cardEl = fanEl.querySelector<HTMLElement>(".game-card");
      const cardWidth = cardEl
        ? cardEl.offsetWidth || cardEl.getBoundingClientRect().width
        : 122;
      const totalWidth = cardCount * cardWidth + Math.max(0, cardCount - 1) * gap;

      if (totalWidth <= availableWidth) {
        fanEl.style.setProperty("--hand-overlap", "0px");
        return;
      }

      const overlap = -Math.min(
        Math.floor(cardWidth * 0.68),
        Math.ceil((totalWidth - availableWidth) / Math.max(1, cardCount - 1))
      );
      fanEl.style.setProperty("--hand-overlap", `${overlap}px`);
    };

    updateOverlap();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverlap);
    observer.observe(fanEl);
    return () => observer.disconnect();
  }, [cardCount]);

  return (
    <div
      className="game-table__console-hand"
      data-flight-anchor="my-hand"
      aria-label={`Hand cards (${cardCount})`}
    >
      <div ref={fanRef} className="game-table__hand-fan">
        {visibleHand.map((card, idx) => {
          const isSelected =
            selectedCardId === card.id || Boolean(selectedCardIds?.includes(card.id));
          const isDiscardCost = Boolean(discardCardIds?.includes(card.id));
          const isRightmost = idx === visibleHand.length - 1;
          return (
            <div
              key={card.id}
              data-flight-anchor={isRightmost ? "my-hand-last" : undefined}
              className={[
                "game-table__hand-card-wrapper",
                isSelected || isDiscardCost ? "game-table__hand-card-wrapper--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <CardView
                card={card}
                isSelected={isSelected}
                isDiscardCost={isDiscardCost}
                onClick={() => onSelectCard(card)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
