import React from "react";

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
  return (
    <>
      {tunnelUrl && (
        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">Invite via Global Cloudflare Link:</span>
          <div className="lobby-screen__lan-list">
            <div className="lobby-screen__lan-item">
              <code className="lobby-screen__lan-code">{tunnelUrl}</code>
              <button
                type="button"
                onClick={() => onCopyUrl(tunnelUrl)}
                className="lobby-screen__copy-btn"
              >
                {copiedUrl === tunnelUrl ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lanUrls.length > 0 && (
        <div className="lobby-screen__form-group">
          <span className="lobby-screen__label">Invite via LAN:</span>
          <div className="lobby-screen__lan-list">
            {lanUrls.map((url) => (
              <div key={url} className="lobby-screen__lan-item">
                <code className="lobby-screen__lan-code">{url}</code>
                <button
                  type="button"
                  onClick={() => onCopyUrl(url)}
                  className="lobby-screen__copy-btn"
                >
                  {copiedUrl === url ? "Copied" : "Copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
