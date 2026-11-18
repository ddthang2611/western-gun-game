import React from "react";
import type { EquipmentSlot, Card } from "../../../../types/game";
import { DebouncedPopover } from "../../../../components/ui";
import { getExtraEquipments } from "../../../../utils/equipments";

export interface EquipmentColumnProps {
  equipments: EquipmentSlot;
}

export const EquipmentColumn: React.FC<EquipmentColumnProps> = ({ equipments }) => {
  const extraCards = getExtraEquipments(equipments);
  const slots: { key: string; card?: Card }[] = [
    { key: "weapon", card: equipments.weapon },
    { key: "barrel", card: equipments.barrel },
    { key: "horseDef", card: equipments.horseDef },
    { key: "horseOff", card: equipments.horseOff },
    { key: "extra_0", card: extraCards[0] },
    { key: "extra_1", card: extraCards[1] },
  ];

  return (
    <div className="game-table__console-equipments">
      {slots.map((slot) => {
        if (!slot.card) {
          return (
            <div
              key={slot.key}
              className="game-table__equip-slot game-table__equip-slot--empty"
              aria-hidden="true"
            />
          );
        }

        const title = slot.card.range
          ? `${slot.card.name} (Range ${slot.card.range})`
          : slot.card.name;

        return (
          <DebouncedPopover
            key={slot.key}
            title={title}
            content={slot.card.desc || slot.card.name}
            delayMs={250}
          >
            <div className="game-table__equip-slot game-table__equip-slot--occupied">
              {slot.card.name}
            </div>
          </DebouncedPopover>
        );
      })}
    </div>
  );
};
