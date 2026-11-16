import React, { useState } from "react";
import type { Character } from "../../../types/game";
import "./CharacterPortrait.scss";

const DEFAULT_PORTRAIT_URL = "/assets/images/characters/char_willy_the_kid.png";

export interface CharacterPortraitProps {
  character: Character;
  size?: "seat" | "console" | "modal";
  showActiveBadge?: boolean;
  className?: string;
}

export const CharacterPortrait: React.FC<CharacterPortraitProps> = ({
  character,
  size = "seat",
  showActiveBadge = false,
  className = "",
}) => {
  const resolvedSrc = character.image || DEFAULT_PORTRAIT_URL;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgSrc = failedSrc === resolvedSrc ? DEFAULT_PORTRAIT_URL : resolvedSrc;

  const rootClasses = [
    "char-portrait",
    `char-portrait--${size}`,
    showActiveBadge ? "char-portrait--active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClasses} title={character.name}>
      <div className="char-portrait__frame">
        <img
          src={imgSrc}
          alt={character.name}
          className="char-portrait__img"
          draggable={false}
          onError={() => {
            if (resolvedSrc !== DEFAULT_PORTRAIT_URL) {
              setFailedSrc(resolvedSrc);
            }
          }}
        />
        {showActiveBadge && (
          <span className="char-portrait__badge">ACTIVE</span>
        )}
      </div>
    </div>
  );
};
