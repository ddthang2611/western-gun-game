import React, { useState } from "react";
import type { ExpansionOptionInfo } from "../../../types/game";
import { useI18n } from "../../../i18n";

export interface CreateRoomPayload {
  roomName: string;
  targetPlayers: number;
  expansions: string[];
  autoFillBots: boolean;
}

export interface CreateRoomCardProps {
  expansionOptions: ExpansionOptionInfo[];
  isConnected: boolean;
  onCreateRoom: (payload: CreateRoomPayload) => void;
}

const TABLE_SIZE_OPTIONS = [3, 4, 5, 6, 7, 8] as const;

export const CreateRoomCard: React.FC<CreateRoomCardProps> = ({
  expansionOptions,
  isConnected,
  onCreateRoom,
}) => {
  const { t } = useI18n();
  const [roomName, setRoomName] = useState("Saloon Table #1");
  const [targetPlayers, setTargetPlayers] = useState<number>(5);
  const [selectedExpansions, setSelectedExpansions] = useState<string[]>(() =>
    expansionOptions.filter((e) => e.active).map((e) => e.id)
  );
  const [autoFillBots, setAutoFillBots] = useState<boolean>(true);

  const handleToggleExpansion = (expId: string, checked: boolean) => {
    setSelectedExpansions((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(expId);
      } else {
        next.delete(expId);
      }
      return Array.from(next);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanExpansions = Array.from(new Set(["base", ...selectedExpansions]));
    onCreateRoom({
      roomName: roomName.trim() || "Saloon Table #1",
      targetPlayers,
      expansions: cleanExpansions,
      autoFillBots,
    });
  };

  return (
    <div className="lobby-screen__auth-card lobby-screen__create-card">
      <h2 className="lobby-screen__card-header">{t("lobby.createTitle")}</h2>
      <p className="lobby-screen__subtitle">{t("lobby.createDesc")}</p>
      <form onSubmit={handleSubmit} className="lobby-screen__form">
        <div className="lobby-screen__form-group">
          <label htmlFor="lobby-room-name" className="lobby-screen__label">
            {t("lobby.roomNameLabel")}
          </label>
          <input
            id="lobby-room-name"
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder={t("lobby.roomNamePlaceholder")}
            className="lobby-screen__input"
            maxLength={32}
          />
        </div>

        <div className="lobby-screen__form-group">
          <label htmlFor="lobby-create-table-size" className="lobby-screen__label">
            {t("lobby.tableSize")}
          </label>
          <select
            id="lobby-create-table-size"
            value={targetPlayers}
            onChange={(e) => setTargetPlayers(Number(e.target.value))}
            className="lobby-screen__select"
          >
            {TABLE_SIZE_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {t(`lobby.sizeOption${count}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.expansions")}</span>
          <div className="lobby-screen__expansions-list">
            {expansionOptions.map((exp) => {
              const isChecked = exp.active && selectedExpansions.includes(exp.id);
              return (
                <label
                  key={exp.id}
                  className={`lobby-screen__checkbox-row${
                    !exp.active ? " lobby-screen__checkbox-row--disabled" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!exp.active}
                    onChange={(e) => handleToggleExpansion(exp.id, e.target.checked)}
                  />
                  <span>{exp.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.botsLabel")}</span>
          <label className="lobby-screen__checkbox-row">
            <input
              type="checkbox"
              checked={autoFillBots}
              onChange={(e) => setAutoFillBots(e.target.checked)}
            />
            <span>{t("lobby.autoFillBots")}</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!isConnected}
          className="lobby-screen__btn lobby-screen__btn--start lobby-screen__btn--full"
        >
          {t("lobby.createBtn")}
        </button>
      </form>
    </div>
  );
};
