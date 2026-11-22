import React from "react";
import { useI18n } from "../../../i18n";

export interface LobbyInviteLinksProps {
  tunnelUrl: string | null;
  lanUrls: string[];
  copiedUrl: string | null;
  onCopyUrl: (url: string) => void;
}

export const LobbyInviteLinks: React.FC<LobbyInviteLinksProps> = ({
  tunnelUrl,
  lanUrls,
  copiedUrl,
  onCopyUrl,
}) => {
  const { t } = useI18n();
  return (
    <>
      {tunnelUrl && (
        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.inviteCloudflare")}</span>
          <div className="lobby-screen__lan-list">
            <div className="lobby-screen__lan-item">
              <code className="lobby-screen__lan-code">{tunnelUrl}</code>
              <button
                type="button"
                onClick={() => onCopyUrl(tunnelUrl)}
                className="lobby-screen__copy-btn"
              >
                {copiedUrl === tunnelUrl ? t("lobby.copied") : t("lobby.copy")}
              </button>
            </div>
          </div>
        </div>
      )}

      {lanUrls.length > 0 && (
        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">{t("lobby.inviteLan")}</span>
          <div className="lobby-screen__lan-list">
            {lanUrls.map((url) => (
              <div key={url} className="lobby-screen__lan-item">
                <code className="lobby-screen__lan-code">{url}</code>
                <button
                  type="button"
                  onClick={() => onCopyUrl(url)}
                  className="lobby-screen__copy-btn"
                >
                  {copiedUrl === url ? t("lobby.copied") : t("lobby.copy")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
