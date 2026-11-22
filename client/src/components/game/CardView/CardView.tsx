import React from "react";
import type { Card, Suit } from "../../../types/game";
import { CardTooltipContent, useI18n } from "../../../i18n";
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

const suitMeta: Record<Suit, { code: string; isRed: boolean }> = {
  spades: { code: "♠", isRed: false },
  clubs: { code: "♣", isRed: false },
  hearts: { code: "♥", isRed: true },
  diamonds: { code: "♦", isRed: true },
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
  const { locale, t, tCard, tSuitName } = useI18n();
  const suitInfo = suitMeta[card.suit] || { code: "", isRed: false };
  const suitLabel = tSuitName(card.suit);
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
              title={suitLabel}
            >
              {suitInfo.code}
            </span>
          </div>
        </>
      )}
    </div>
  );

  if (isFaceDown || card.id === "SECRET") {
    return cardElement;
  }

  const { primary, secondary } = tCard(card);
  const subtitle =
    locale === "vi" && primary.subtitleVi ? ` (${primary.subtitleVi})` : "";
  const titleText = `${primary.name}${subtitle}${
    card.rank && suitInfo.code ? ` (${card.rank}${suitInfo.code})` : ""
  }`;
  const borderKey =
    card.border === "blue"
      ? "popover.type.blue"
      : card.border === "green"
      ? "popover.type.green"
      : "popover.type.brown";

  return (
    <DebouncedPopover
      title={titleText}
      content={
        <CardTooltipContent
          typeLabel={t(borderKey)}
          primaryDesc={primary.desc || card.desc}
          actionSummary={primary.actionSummary}
          secondaryTitle={secondary?.name}
          secondaryDesc={secondary?.desc}
          range={card.range}
          suit={card.suit}
          rank={card.rank}
        />
      }
      delayMs={300}
    >
      {cardElement}
    </DebouncedPopover>
  );
};
