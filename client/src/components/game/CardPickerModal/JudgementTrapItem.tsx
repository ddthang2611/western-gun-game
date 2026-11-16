import React from "react";

export type JudgementTrapType = "jail" | "dynamite";

export interface JudgementTrapItemProps {
  id: string;
  type: JudgementTrapType;
  label: string;
  isSelected: boolean;
  onSelect: (cardId: string, label: string) => void;
}

export const JudgementTrapItem: React.FC<JudgementTrapItemProps> = ({
  id,
  type,
  label,
  isSelected,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(id, label)}
    className={[
      "card-picker__judgement-btn",
      `card-picker__judgement-btn--${type}`,
      isSelected ? "card-picker__judgement-btn--selected" : "",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {label}
  </button>
);
