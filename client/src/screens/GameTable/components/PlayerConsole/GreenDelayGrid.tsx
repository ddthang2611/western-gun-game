import React from "react";
import type { GreenCard } from "../../../../types/game";
import { CardTooltipContent, useI18n } from "../../../../i18n";
import { DebouncedPopover } from "../../../../components/ui";

export interface GreenDelayGridProps {
  greenCards: GreenCard[];
  concealedCardIds?: string[];
  selectedGreenCardId?: string | null;
  onTriggerGreenCard: (card: GreenCard) => void;
}

export const GreenDelayGrid: React.FC<GreenDelayGridProps> = ({
  greenCards,
  concealedCardIds,
  selectedGreenCardId,
  onTriggerGreenCard,
}) => {
  const { locale, t, tCard } = useI18n();
  const visibleGreens = concealedCardIds?.length
    ? greenCards.filter(
        (g) => !concealedCardIds.includes(g.card.id) && !concealedCardIds.includes(g.id)
      )
    : greenCards;
  const slotCount = Math.max(12, visibleGreens.length);

  return (
    <div className="game-table__console-green" data-flight-anchor="my-green">
      <div className="game-table__green-grid">
        {Array.from({ length: slotCount }).map((_, idx) => {
          const gCard = visibleGreens[idx];
          if (!gCard) {
            return (
              <div
                key={`empty_green_${idx}`}
                className="game-table__green-slot game-table__green-slot--empty"
                aria-hidden="true"
              />
            );
          }

          const cardLoc = tCard(gCard.card);
          const sub =
            locale === "vi" && cardLoc.primary.subtitleVi
              ? ` (${cardLoc.primary.subtitleVi})`
              : "";
          const isSelected = selectedGreenCardId === gCard.id;

          return (
            <DebouncedPopover
              key={gCard.id}
              title={`${cardLoc.primary.name}${sub}`}
              content={
                <CardTooltipContent
                  typeLabel={t("popover.type.green")}
                  primaryDesc={cardLoc.primary.desc || gCard.card.desc}
                  actionSummary={cardLoc.primary.actionSummary}
                  secondaryTitle={cardLoc.secondary?.name}
                  secondaryDesc={cardLoc.secondary?.desc}
                  suit={gCard.card.suit}
                  rank={gCard.card.rank}
                />
              }
              delayMs={250}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                data-target-origin={isSelected ? "green" : undefined}
                onClick={() => onTriggerGreenCard(gCard)}
                className={[
                  "game-table__green-slot",
                  "game-table__green-slot--occupied",
                  gCard.isDelay
                    ? "game-table__green-slot--delay"
                    : "game-table__green-slot--ready",
                  isSelected ? "game-table__green-slot--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="game-table__green-name">{gCard.card.name}</span>
              </button>
            </DebouncedPopover>
          );
        })}
      </div>
    </div>
  );
};
