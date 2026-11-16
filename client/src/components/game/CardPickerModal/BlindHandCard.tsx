import React from "react";

export interface BlindHandCardProps {
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}

export const BlindHandCard: React.FC<BlindHandCardProps> = ({
  index,
  isSelected,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(index)}
    aria-pressed={isSelected}
    aria-label={`Face-down card number ${index + 1}`}
    className={`card-picker__hand-card ${
      isSelected ? "card-picker__hand-card--selected" : ""
    }`.trim()}
  >
    <img
      src="/assets/images/ui/card_back.png"
      alt=""
      aria-hidden="true"
      className="card-picker__hand-card-img"
    />
    <span className="card-picker__hand-card-index">#{index + 1}</span>
  </button>
);
