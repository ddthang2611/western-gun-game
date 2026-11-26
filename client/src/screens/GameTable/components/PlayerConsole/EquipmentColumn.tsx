import React from "react";
import type { EquipmentSlot } from "../../../../types/game";
import { CardTooltipContent, useI18n } from "../../../../i18n";
import { DebouncedPopover } from "../../../../components/ui";
import { getFixedEquipmentSlots } from "../../../../utils/equipments";

export interface EquipmentColumnProps {
  equipments: EquipmentSlot;
  concealedCardIds?: string[];
}

export const EquipmentColumn: React.FC<EquipmentColumnProps> = ({
  equipments,
  concealedCardIds,
}) => {
  const { tCard } = useI18n();
  const concealedSet = concealedCardIds?.length ? new Set(concealedCardIds) : undefined;
  const slots = getFixedEquipmentSlots(equipments, concealedSet);

  return (
    <div className="game-table__console-equipments" data-flight-anchor="my-equip">
      {slots.map((slot) => {
        const anchor = `my-equip-${slot.slotKey}`;
        if (!slot.card) {
          return (
            <div
              key={slot.slotKey}
              data-flight-anchor={anchor}
              className="game-table__equip-slot game-table__equip-slot--empty"
              aria-hidden="true"
            />
          );
        }

        const cardLoc = tCard(slot.card);

        return (
          <DebouncedPopover
            key={slot.slotKey}
            content={
              <CardTooltipContent
                primaryDesc={cardLoc.primary.desc || slot.card.desc}
                secondaryDesc={cardLoc.secondary?.desc}
              />
            }
            delayMs={250}
          >
            <div
              data-flight-anchor={anchor}
              className="game-table__equip-slot game-table__equip-slot--occupied"
            >
              {slot.card.name}
            </div>
          </DebouncedPopover>
        );
      })}
    </div>
  );
};
