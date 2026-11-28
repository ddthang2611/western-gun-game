import React from "react";
import type { Character } from "../../../types/game";
import { CardTooltipContent, useI18n } from "../../../i18n";
import { CharacterPortrait } from "../CharacterPortrait/CharacterPortrait";
import { DebouncedPopover } from "../../ui/DebouncedPopover/DebouncedPopover";

export interface CharacterCandidateCardProps {
  character: Character;
  isSelected: boolean;
  onToggle: (character: Character) => void;
}

export const CharacterCandidateCard: React.FC<CharacterCandidateCardProps> = ({
  character,
  isSelected,
  onToggle,
}) => {
  const { tChar } = useI18n();
  const charLoc = tChar(character);

  return (
    <DebouncedPopover
      content={
        <CardTooltipContent
          primaryDesc={charLoc.primary.desc}
          secondaryDesc={charLoc.secondary?.desc}
        />
      }
      delayMs={200}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onToggle(character)}
        className={`char-select__candidate-card ${
          isSelected ? "char-select__candidate-card--selected" : ""
        }`.trim()}
      >
        <CharacterPortrait character={character} size="modal" />
      </button>
    </DebouncedPopover>
  );
};
