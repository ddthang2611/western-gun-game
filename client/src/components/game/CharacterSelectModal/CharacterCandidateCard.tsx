import React from "react";
import type { Character } from "../../../types/game";
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
}) => (
  <DebouncedPopover
    title={`${character.name} (Base HP: ${character.baseHp})`}
    content={character.desc}
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
