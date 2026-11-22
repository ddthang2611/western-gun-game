import React from "react";
import type { ExpansionOptionInfo, GameSettings } from "../../../types/game";
import { useI18n } from "../../../i18n";
import { LobbyInviteLinks } from "./LobbyInviteLinks";

export interface LobbySettingsPanelProps {
  settings: GameSettings;
  expansionOptions: ExpansionOptionInfo[];
  isHost: boolean;
  tunnelUrl: string | null;
  lanUrls: string[];
  copiedUrl: string | null;
  onToggleExpansion: (expId: string, enabled: boolean) => void;
  onCopyUrl: (url: string) => void;
}

export const LobbySettingsPanel: React.FC<LobbySettingsPanelProps> = ({
  settings,
  expansionOptions,
  isHost,
  tunnelUrl,
  lanUrls,
  copiedUrl,
  onToggleExpansion,
  onCopyUrl,
}) => {
  const { t } = useI18n();
  return (
    <div className="lobby-screen__panel">
      <h2 className="lobby-screen__panel-title">{t("lobby.settingsTitle")}</h2>
      <div className="lobby-screen__settings-form">
        <div className="lobby-screen__mode-notice">
          {t("lobby.singleCharNotice")}
        </div>

        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.expansions")}</span>
          <div className="lobby-screen__expansions-list">
            {expansionOptions.map((exp) => {
              const isChecked = exp.active && (settings.expansions || []).includes(exp.id);
              const isDisabled = !isHost || !exp.active;
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
