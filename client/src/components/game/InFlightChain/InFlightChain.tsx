import React, { useLayoutEffect, useRef } from "react";
import type { InFlightCard } from "../../../types/game";
import { CardView } from "../CardView/CardView";
import "./InFlightChain.scss";

export interface InFlightChainProps {
  cards: InFlightCard[];
}

export const InFlightChain: React.FC<InFlightChainProps> = ({ cards }) => {
  const fanRef = useRef<HTMLDivElement | null>(null);
  // Deduplicate AoE reactions sharing one card
  const uniqueCards = React.useMemo(() => {
    const seen = new Set<string>();
    return (cards || []).filter((item) => {
      const key = item.isFlipReveal ? item.id : item.card?.id || item.id;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [cards]);
  const cardCount = uniqueCards.length;
  // Keep 36px left edge visible
  const maxOverlap = 74;
  const overlapMargin =
    cardCount > 1
      ? Math.min(maxOverlap, Math.floor((maxOverlap * (cardCount - 1)) / cardCount))
      : 0;

  useLayoutEffect(() => {
    const fan = fanRef.current;
    if (!fan) return;
    fan.style.setProperty("--chain-overlap", cardCount > 1 ? `-${overlapMargin}px` : "0px");
  }, [cardCount, overlapMargin]);

  if (uniqueCards.length === 0) {
    return (
      <div className="inflight-chain inflight-chain--empty">
        <span className="inflight-chain__placeholder">Card Arena</span>
      </div>
    );
  }

  return (
    <div className="inflight-chain">
      <div ref={fanRef} className="inflight-chain__fan">
        {uniqueCards.map((item, index) => (
          <div
            key={item.id || index}
            className={`inflight-chain__card-slot${
              item.isFlipReveal ? " inflight-chain__card-slot--flip" : ""
            }`}
            title={`${item.sourcePlayerName}${
              item.targetPlayerName ? ` -> ${item.targetPlayerName}` : ""
            }: ${item.actionText}`}
          >
            {item.isFlipReveal ? (
              <div className="inflight-chain__flipper">
                <div className="inflight-chain__face inflight-chain__face--front">
                  <CardView card={item.card} isPlayable={false} />
                </div>
                <div className="inflight-chain__face inflight-chain__face--back">
                  <img
                    src="/assets/images/ui/card_back.png"
                    alt="Face-down check card"
                    draggable={false}
                  />
                </div>
              </div>
            ) : (
              <CardView card={item.card} isPlayable={false} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
