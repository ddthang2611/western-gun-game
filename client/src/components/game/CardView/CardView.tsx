import React from "react";
import type { Card, Suit } from "../../../types/game";
import { DebouncedPopover } from "../../ui/DebouncedPopover/DebouncedPopover";
import "./CardView.scss";

export interface CardViewProps {
  card: Card;
  isSelected?: boolean;
  isDiscardCost?: boolean;
  isPlayable?: boolean;
  isDisabled?: boolean;
  isMini?: boolean;
  isFaceDown?: boolean;
  onClick?: () => void;
  className?: string;
}

const suitMeta: Record<Suit, { code: string; label: string; isRed: boolean }> = {
  spades: { code: "S", label: "Spades", isRed: false },
  clubs: { code: "C", label: "Clubs", isRed: false },
  hearts: { code: "H", label: "Hearts", isRed: true },
  diamonds: { code: "D", label: "Diamonds", isRed: true },
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  isSelected = false,
  isDiscardCost = false,
  isPlayable = true,
  isDisabled = false,
  isMini = false,
  isFaceDown = false,
  onClick,
  className = "",
}) => {
  const suitInfo = suitMeta[card.suit] || { code: "", label: "", isRed: false };
  const hasArtwork = isFaceDown || Boolean(card.image);

  const cardClasses = [
    "game-card",
    hasArtwork
      ? "game-card--artwork"
      : `game-card--border-${card.border || "brown"}`,
    isFaceDown ? "game-card--face-down" : "",
    isMini ? "game-card--mini" : "",
    isSelected ? "game-card--selected" : "",
    isDiscardCost ? "game-card--discard-cost" : "",
    isDisabled
      ? "game-card--disabled"
      : isPlayable
      ? "game-card--playable"
      : "game-card--default",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const cardElement = (
    <div
      onClick={!isDisabled ? onClick : undefined}
      className={cardClasses}
    >
      {isFaceDown ? (
        <img
          src="/assets/images/ui/card_back.png"
          alt="Face-down card"
          className="game-card__physical-img"
          draggable={false}
        />
      ) : card.image ? (
        <img
          src={card.image}
          alt={card.name}
          className="game-card__physical-img"
          draggable={false}
        />
      ) : (
        <>
          <div className={`game-card__header ${isMini ? "game-card__header--mini" : ""}`.trim()}>
            {card.name}
          </div>

          <div className="game-card__body">
            <div className={`game-card__symbol ${isMini ? "game-card__symbol--mini" : ""}`.trim()}>
              {card.range ? `R: ${card.range}` : card.name.charAt(0)}
            </div>
          </div>

          <div className={`game-card__footer ${isMini ? "game-card__footer--mini" : ""}`.trim()}>
            <span className={suitInfo.isRed ? "game-card__suit--red" : "game-card__suit--black"}>
              {card.rank}
            </span>
            <span
              className={suitInfo.isRed ? "game-card__suit--red" : "game-card__suit--black"}
              title={suitInfo.label}
            >
              {suitInfo.code}
            </span>
          </div>
        </>
      )}
    </div>
  );

  if (isFaceDown) {
    return cardElement;
  }

  const cardDescription =
    card.desc ||
    (card.name === "BANG!"
      ? "Shoot another player within weapon range. Target must discard a Missed! or lose 1 life point."
      : card.name === "MISSED!"
      ? "Play immediately out of turn to cancel a BANG! aimed at you."
      : card.name === "BEER"
      ? "Regain 1 life point immediately. Cannot be played if only 2 players remain."
      : card.name === "SALOON"
      ? "All players in play recover 1 life point immediately."
      : `${card.name}: Western action card.`);

  return (
    <DebouncedPopover
      title={`${card.name} (${card.rank}${suitInfo.code})`}
      content={cardDescription}
      delayMs={300}
    >
      {cardElement}
    </DebouncedPopover>
  );
};
