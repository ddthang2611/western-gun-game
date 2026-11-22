import React from "react";
import { useI18n } from "../../../i18n";

export interface BlindHandCardProps {
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
}

export const BlindHandCard: React.FC<BlindHandCardProps> = ({
  index,
  isSelected,
  onSelect,
}) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-pressed={isSelected}
      aria-label={t("modals.picker.blindCardLabel", { num: index + 1 })}
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
};
