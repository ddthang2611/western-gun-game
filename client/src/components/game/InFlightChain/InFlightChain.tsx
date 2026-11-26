import React, { useLayoutEffect, useRef } from "react";
import type { ArenaOutcomeTag, InFlightCard } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { CardView } from "../CardView/CardView";
import "./InFlightChain.scss";

export interface InFlightChainProps {
  cards: InFlightCard[];
  isExiting?: boolean;
}

const OUTCOME_TONE: Record<ArenaOutcomeTag, "good" | "bad"> = {
  PASSED: "good",
  ESCAPED: "good",
  CORRECT: "good",
  FAILED: "bad",
  EXPLODED: "bad",
  LOCKED: "bad",
  WRONG: "bad",
};

export const InFlightChain: React.FC<InFlightChainProps> = ({
  cards,
  isExiting = false,
}) => {
  const { t, tOutcome } = useI18n();
  const fanRef = useRef<HTMLDivElement | null>(null);
  const safeCards = cards || [];
  const cardCount = safeCards.length;

  // Keep enough left edge visible while fitting multi-target AoE chains cleanly
  const maxOverlap = cardCount > 8 ? 84 : 62;
  const overlapMargin =
    cardCount > 1
      ? Math.min(maxOverlap, Math.floor((maxOverlap * (cardCount - 1)) / Math.max(cardCount, 2)))
      : 0;

  useLayoutEffect(() => {
    const fan = fanRef.current;
    if (!fan) return;
    fan.style.setProperty("--chain-overlap", cardCount > 1 ? `-${overlapMargin}px` : "0px");
  }, [cardCount, overlapMargin]);

  if (cardCount === 0) {
    return (
      <div className="inflight-chain inflight-chain--empty" data-flight-anchor="card-arena">
        <span className="inflight-chain__placeholder">{t("arena.defaultTitle")}</span>
      </div>
    );
  }

  return (
    <div
      className={`inflight-chain${isExiting ? " inflight-chain--exiting" : ""}`}
      data-flight-anchor="card-arena"
    >
      <div ref={fanRef} className="inflight-chain__fan">
        {safeCards.map((item, index) => {
          const outcome = item.outcome ?? item.meta?.outcome;
          const outcomeTone = outcome ? OUTCOME_TONE[outcome] : undefined;
          return (
            <div key={item.id || index} className="inflight-chain__card-slot">
              <div className="inflight-chain__card-frame">
                <CardView card={item.card} isPlayable={false} />
                {outcome && (
                  <span
                    className={`inflight-chain__outcome inflight-chain__outcome--${outcomeTone}`}
                  >
                    {tOutcome(outcome)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
