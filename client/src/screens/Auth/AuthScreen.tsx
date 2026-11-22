import React, { useState, useEffect, useCallback } from "react";
import { LanguageSwitcher, useI18n } from "../../i18n";
import { wsClient } from "../../services/wsClient";
import "./AuthScreen.scss";

export interface AuthScreenProps {
  onAuthenticated: (user: { playerId: string; name: string }) => void;
  noticeMessage?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, noticeMessage }) => {
  const { t, tError } = useI18n();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showDbKey, setShowDbKey] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [isDbLocked, setIsDbLocked] = useState(false);
  const [dbSecretKey, setDbSecretKey] = useState("");
  const [unlockMessage, setUnlockMessage] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [lanIps, setLanIps] = useState<string[]>([]);

  const checkSession = useCallback(async () => {
    if (noticeMessage) return;
    try {
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.authenticated && meData.user) {
          onAuthenticated(meData.user);
        }
      }
    } catch {
      // No active session found
    }
  }, [noticeMessage, onAuthenticated]);

  const syncServerStatus = useCallback(async (): Promise<boolean | null> => {
    try {
      const statusRes = await fetch("/api/status");
      if (!statusRes.ok) return null;
      const statusData = await statusRes.json();
      const locked = statusData.status === "locked" || statusData.requiresUnlock === true;
      setIsDbLocked(locked);
      if (Array.isArray(statusData.lanIps)) {
        setLanIps(statusData.lanIps);
      }
      return locked;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      const locked = await syncServerStatus();
      if (!isMounted) return;
      if (locked === false || locked === null) {
        await checkSession();
      }
    }

    void initAuth();

    const unsubscribe = wsClient.subscribe((msg) => {
      if (msg.type === "DATABASE_UNLOCKED" && isMounted) {
        setIsDbLocked(false);
        setUnlockMessage("");
        void syncServerStatus();
        void checkSession();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [checkSession, syncServerStatus]);

  useEffect(() => {
    if (!isDbLocked) return;
    let active = true;
    const timer = window.setInterval(async () => {
      const locked = await syncServerStatus();
      if (active && locked === false) {
        setUnlockMessage("");
        void checkSession();
      }
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isDbLocked, checkSession, syncServerStatus]);

  const handleUnlockDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbSecretKey.trim()) return;

    setUnlockLoading(true);
    setUnlockMessage("");

    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretKey: dbSecretKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsDbLocked(false);
        setUnlockMessage(t("auth.dbUnlocked"));
      } else {
        setUnlockMessage(
          tError({
            code: data.code,
            message: data.message,
            params: data.params,
          })
        );
      }
    } catch {
      setUnlockMessage(t("auth.authErrorFallback"));
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPin = pin.trim();

    if (!cleanName) {
      setErrorMessage(tError("PLAYER_NAME_LENGTH"));
      return;
    }
    if (!cleanPin || cleanPin.length !== 4) {
      setErrorMessage(tError("PIN_LENGTH"));
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, pin: cleanPin }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onAuthenticated(data.user);
      } else {
        setErrorMessage(
          tError({
            code: data.code,
            message: data.message || t("auth.authErrorFallback"),
            params: data.params,
          })
        );
      }
    } catch {
      setErrorMessage(t("auth.authErrorFallback"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__card">
        <div className="auth-screen__header">
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: "6px" }}>
            <LanguageSwitcher compact showBilingualToggle={false} />
          </div>
          <img
            src="/app_icon.png"
            alt="Western Gun Emblem"
            className="auth-screen__logo-img"
            width={72}
            height={72}
          />
          <h1 className="auth-screen__title">WESTERN GUN</h1>
          <div className="auth-screen__subtitle">{t("auth.subtitle")}</div>
          {lanIps.length > 0 && (
            <div className="auth-screen__lan-badge">
              LAN IP: {lanIps.join(", ")}
            </div>
          )}
        </div>

        {noticeMessage && (
          <div role="alert" className="auth-screen__error">
            {noticeMessage}
          </div>
        )}

        {isDbLocked ? (
          <div className="auth-screen__lock-banner">
            <div className="auth-screen__lock-title">{t("auth.dbUnlockTitle")}</div>
            <div className="auth-screen__lock-desc">{t("auth.dbUnlockDesc")}</div>
            <form onSubmit={handleUnlockDatabase} className="auth-screen__form">
              <div className="auth-screen__form-group">
                <label htmlFor="db-security-key" className="auth-screen__label auth-screen__label--lock">
                  {t("auth.dbKeyLabel")}
                </label>
                <div className="auth-screen__input-wrap">
                  <input
                    id="db-security-key"
                    type={showDbKey ? "text" : "password"}
                    autoComplete="off"
                    value={dbSecretKey}
                    onChange={(e) => setDbSecretKey(e.target.value)}
                    placeholder={t("auth.dbKeyPlaceholder")}
                    className="auth-screen__input auth-screen__input--lock"
                  />
                  <button
                    type="button"
                    aria-pressed={showDbKey}
                    onClick={() => setShowDbKey((prev) => !prev)}
                    className="auth-screen__toggle-btn"
                  >
                    {showDbKey ? t("auth.hideKey") : t("auth.showKey")}
                  </button>
                </div>
              </div>
              {unlockMessage && (
                <div className="auth-screen__unlock-message">{unlockMessage}</div>
              )}
              <button
                type="submit"
                disabled={unlockLoading}
                className="auth-screen__submit-btn auth-screen__submit-btn--unlock"
              >
                {unlockLoading ? t("auth.unlocking") : t("auth.unlockBtn")}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleJoinLobby} className="auth-screen__form">
            <div className="auth-screen__form-group">
              <label htmlFor="auth-player-name" className="auth-screen__label">
                {t("auth.playerNameLabel")}
              </label>
              <input
                id="auth-player-name"
                type="text"
                autoComplete="username"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.playerNamePlaceholder")}
                className="auth-screen__input"
              />
            </div>

            <div className="auth-screen__form-group">
              <label htmlFor="auth-player-pin" className="auth-screen__label">
                {t("auth.pinLabel")}
              </label>
              <div className="auth-screen__input-wrap">
                <input
                  id="auth-player-pin"
                  type={showPin ? "text" : "password"}
                  autoComplete="current-password"
                  maxLength={4}
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("auth.pinPlaceholder")}
                  className="auth-screen__input auth-screen__input--pin"
                />
                <button
                  type="button"
                  aria-pressed={showPin}
                  onClick={() => setShowPin((prev) => !prev)}
                  className="auth-screen__toggle-btn"
                >
                  {showPin ? t("auth.hideKey") : t("auth.showKey")}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div role="alert" className="auth-screen__error">{errorMessage}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="auth-screen__submit-btn"
            >
              {loading ? t("auth.signingIn") : t("auth.enterSaloon")}
            </button>
          </form>
        )}

        <div className="auth-screen__footer">
          <a href="/dev-test" className="auth-screen__dev-link">
            {t("auth.devLink")}
          </a>
        </div>
      </div>
    </div>
  );
};
