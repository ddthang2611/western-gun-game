import React from "react";
import type { Character } from "../../../types/game";
import { CharacterPortrait } from "../CharacterPortrait/CharacterPortrait";

export interface CharacterPreviewItemProps {
  character: Character;
}

export const CharacterPreviewItem: React.FC<CharacterPreviewItemProps> = ({
  character,
}) => (
  <div className="char-select__preview-card">
    <CharacterPortrait character={character} size="modal" />
  </div>
);
