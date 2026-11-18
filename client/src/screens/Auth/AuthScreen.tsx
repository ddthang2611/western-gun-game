import React, { useState, useEffect, useCallback } from "react";
import { wsClient } from "../../services/wsClient";
import "./AuthScreen.scss";

export interface AuthScreenProps {
  onAuthenticated: (user: { playerId: string; name: string }) => void;
  noticeMessage?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, noticeMessage }) => {
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
        setUnlockMessage("Database unlocked successfully.");
      } else {
        setUnlockMessage(data.message || "Invalid security key.");
      }
    } catch {
      setUnlockMessage("Unable to connect to server.");
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPin = pin.trim();

    if (!cleanName) {
      setErrorMessage("Please enter player name (max 20 characters).");
      return;
    }
    if (!cleanPin || cleanPin.length !== 4) {
      setErrorMessage("PIN must contain exactly 4 digits.");
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
        setErrorMessage(data.message || "Authentication failed.");
      }
    } catch {
      setErrorMessage("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__card">
        <div className="auth-screen__header">
          <img
            src="/app_icon.png"
            alt="Western Gun Emblem"
            className="auth-screen__logo-img"
            width={72}
            height={72}
          />
          <h1 className="auth-screen__title">WESTERN GUN</h1>
          <div className="auth-screen__subtitle">
            Version 1.2.0 - Wild West Card Game
          </div>
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
            <div className="auth-screen__lock-title">DATABASE LOCKED</div>
            <div className="auth-screen__lock-desc">
              System requires a security key to initialize game assets and catalog.
            </div>
            <form onSubmit={handleUnlockDatabase} className="auth-screen__form">
              <div className="auth-screen__form-group">
                <label htmlFor="db-security-key" className="auth-screen__label auth-screen__label--lock">
                  Database Security Key:
                </label>
                <div className="auth-screen__input-wrap">
                  <input
                    id="db-security-key"
                    type={showDbKey ? "text" : "password"}
                    autoComplete="off"
                    value={dbSecretKey}
                    onChange={(e) => setDbSecretKey(e.target.value)}
                    placeholder="Enter database security key"
                    className="auth-screen__input auth-screen__input--lock"
                  />
                  <button
                    type="button"
                    aria-pressed={showDbKey}
                    onClick={() => setShowDbKey((prev) => !prev)}
                    className="auth-screen__toggle-btn"
                  >
                    {showDbKey ? "Hide" : "Show"}
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
                {unlockLoading ? "Unlocking..." : "Unlock Database"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleJoinLobby} className="auth-screen__form">
            <div className="auth-screen__form-group">
              <label htmlFor="auth-player-name" className="auth-screen__label">
                Player Name (Max 20 chars):
              </label>
              <input
                id="auth-player-name"
                type="text"
                autoComplete="username"
                maxLength={20}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Billy The Kid"
                className="auth-screen__input"
              />
            </div>

            <div className="auth-screen__form-group">
              <label htmlFor="auth-player-pin" className="auth-screen__label">
                4-Digit PIN:
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
                  placeholder="4 digits"
                  className="auth-screen__input auth-screen__input--pin"
                />
                <button
                  type="button"
                  aria-pressed={showPin}
                  onClick={() => setShowPin((prev) => !prev)}
                  className="auth-screen__toggle-btn"
                >
                  {showPin ? "Hide" : "Show"}
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
              {loading ? "Authenticating..." : "Join Lobby"}
            </button>
          </form>
        )}

        <div className="auth-screen__footer">
          <a href="/dev-test" className="auth-screen__dev-link">
            UI Sandbox &amp; Characters Preview (/dev-test)
          </a>
        </div>
      </div>
    </div>
  );
};
