import React from "react";
import type { ExpansionOptionInfo, GameSettings } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { LobbyInviteLinks } from "./LobbyInviteLinks";

export interface LobbySettingsPanelProps {
  settings: GameSettings;
  expansionOptions: ExpansionOptionInfo[];
  isHost: boolean;
  status: "waiting" | "in_game";
  humanCount: number;
  tunnelUrl: string | null;
  lanUrls: string[];
  copiedUrl: string | null;
  onChangeTargetPlayers: (targetPlayers: number) => void;
  onToggleAutoFillBots: (enabled: boolean) => void;
  onToggleExpansion: (expId: string, enabled: boolean) => void;
  onCopyUrl: (url: string) => void;
}

const TABLE_SIZE_OPTIONS = [3, 4, 5, 6, 7, 8] as const;

export const LobbySettingsPanel: React.FC<LobbySettingsPanelProps> = ({
  settings,
  expansionOptions,
  isHost,
  status,
  humanCount,
  tunnelUrl,
  lanUrls,
  copiedUrl,
  onChangeTargetPlayers,
  onToggleAutoFillBots,
  onToggleExpansion,
  onCopyUrl,
}) => {
  const { t } = useI18n();
  const targetPlayers = settings.targetPlayers || 5;
  const autoFillBots = settings.autoFillBots ?? true;
  const canEditSettings = isHost && status === "waiting";

  return (
    <div className="lobby-screen__panel">
      <h2 className="lobby-screen__panel-title">{t("lobby.settingsTitle")}</h2>
      <div className="lobby-screen__settings-form">
        <div className="lobby-screen__mode-notice">
          {t("lobby.singleCharNotice")}
        </div>

        <div className="lobby-screen__form-group">
          <label htmlFor="lobby-settings-table-size" className="lobby-screen__label">
            {t("lobby.tableSize")}
          </label>
          <select
            id="lobby-settings-table-size"
            value={targetPlayers}
            disabled={!canEditSettings}
            onChange={(e) => onChangeTargetPlayers(Number(e.target.value))}
            className="lobby-screen__select"
          >
            {TABLE_SIZE_OPTIONS.map((count) => (
              <option key={count} value={count} disabled={count < humanCount}>
                {t(`lobby.sizeOption${count}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.botsLabel")}</span>
          <label
            className={`lobby-screen__checkbox-row${
              !canEditSettings ? " lobby-screen__checkbox-row--disabled" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={autoFillBots}
              disabled={!canEditSettings}
              onChange={(e) => onToggleAutoFillBots(e.target.checked)}
            />
            <span>{t("lobby.autoFillBots")}</span>
          </label>
        </div>

        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.expansions")}</span>
          <div className="lobby-screen__expansions-list">
            {expansionOptions.map((exp) => {
              const isChecked = exp.active && (settings.expansions || []).includes(exp.id);
              const isDisabled = !canEditSettings || !exp.active;
              return (
                <label
                  key={exp.id}
                  className={`lobby-screen__checkbox-row${
                    isDisabled ? " lobby-screen__checkbox-row--disabled" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={(e) => onToggleExpansion(exp.id, e.target.checked)}
                  />
                  <span>{exp.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <LobbyInviteLinks
          tunnelUrl={tunnelUrl}
          lanUrls={lanUrls}
          copiedUrl={copiedUrl}
          onCopyUrl={onCopyUrl}
        />
      </div>
    </div>
  );
};
