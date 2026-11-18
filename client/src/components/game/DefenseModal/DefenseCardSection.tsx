import React from "react";
import type { Card } from "../../../types/game";
import { Panel } from "../../ui/Panel/Panel";
import { CardView } from "../CardView/CardView";

export interface DefenseCardItem {
  id: string;
  card: Card;
  eligible?: boolean;
}

export interface DefenseCardSectionProps {
  title?: string;
  hint?: string;
  emptyText?: string;
  items: DefenseCardItem[];
  selectedIds: string[];
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export const DefenseCardSection: React.FC<DefenseCardSectionProps> = ({
  title,
  hint,
  emptyText,
  items,
  selectedIds,
  disabled = false,
  onSelect,
}) => {
  return (
    <Panel>
      {title && <div className="defense-modal__section-label">{title}</div>}
      {hint && <div className="defense-modal__hint">{hint}</div>}
      <div className="defense-modal__card-list">
        {items.length === 0 && emptyText ? (
          <div className="defense-modal__empty">{emptyText}</div>
        ) : (
          items.map((item) => {
            const eligible = item.eligible ?? true;
            return (
              <CardView
                key={item.id}
                card={item.card}
                isMini={true}
                isPlayable={!disabled && eligible}
                isDisabled={disabled || !eligible}
                isSelected={selectedIds.includes(item.id)}
                onClick={() => {
                  if (!disabled && eligible) onSelect(item.id);
                }}
              />
            );
          })
        )}
      </div>
    </Panel>
  );
};
