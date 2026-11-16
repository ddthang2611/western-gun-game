import React from "react";
import type { GreenCard } from "../../../../types/game";
import { DebouncedPopover } from "../../../../components/ui";

export interface GreenDelayGridProps {
  greenCards: GreenCard[];
  selectedGreenCardId?: string | null;
  onTriggerGreenCard: (card: GreenCard) => void;
}

const getGreenCardDesc = (name: string, fallback?: string): string => {
  if (fallback) return fallback;
  const upper = name.toUpperCase();
  if (upper.includes("BIBLE")) return "Discard when targeted by BANG! to cancel it and draw 1 card from the deck.";
  if (upper.includes("BUFFALO")) return "Discard to fire a BANG! at any target player, regardless of distance.";
  if (upper.includes("SOMBRERO") || upper.includes("PLATE") || upper.includes("HAT")) return "Discard when targeted by BANG! to act as a Missed!.";
  if (upper.includes("KNIFE") || upper.includes("DERRINGER")) return "Discard to fire a BANG! at a player at distance 1.";
  if (upper.includes("PEPPERBOX")) return "Discard to fire a BANG! at a target within your weapon range.";
  if (upper.includes("CANTEEN")) return "Discard during your turn to recover 1 life point.";
  if (upper.includes("HOWITZER")) return "Discard to fire a Gatling shot attacking all other players.";
  if (upper.includes("PONY")) return "Discard to draw 3 cards from the draw pile.";
  if (upper.includes("CONESTOGA")) return "Discard to draw 1 card from any player at any distance.";
  return "Green delayed card. Must stay in play for 1 turn before you can activate its effect.";
};

export const GreenDelayGrid: React.FC<GreenDelayGridProps> = ({
  greenCards,
  selectedGreenCardId,
  onTriggerGreenCard,
}) => {
  const slotCount = Math.max(5, greenCards.length);

  return (
    <div className="game-table__console-green">
      <div className="game-table__green-grid">
        {Array.from({ length: slotCount }).map((_, idx) => {
          const gCard = greenCards[idx];
          if (!gCard) {
            return (
              <div
                key={`empty_green_${idx}`}
                className="game-table__green-slot game-table__green-slot--empty"
                aria-hidden="true"
              />
            );
          }

          const desc = getGreenCardDesc(gCard.card.name, gCard.card.desc);
          const isSelected = selectedGreenCardId === gCard.id;
          return (
            <DebouncedPopover
              key={gCard.id}
              title={gCard.card.name}
              content={desc}
              delayMs={250}
            >
              <button
                type="button"
                aria-pressed={isSelected}
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
