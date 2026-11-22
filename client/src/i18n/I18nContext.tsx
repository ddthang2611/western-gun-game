import React, { useCallback, useEffect, useMemo, useState } from "react";
import { I18nContext, type I18nContextValue } from "./context";
import { formatStructuredLog } from "./logFormatter";
import {
  translateCard,
  translateCharacter,
  translateErrorMessage,
  translateEvent,
  translateOutcome,
  translateRoleName,
  translateSuitName,
  translateSuitSymbol,
  translateUi,
} from "./resolvers";
import type { Locale } from "./types";

const STORAGE_LOCALE_KEY = "wg_locale";
const STORAGE_BILINGUAL_KEY = "wg_bilingual_cards";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const queryLang = new URLSearchParams(window.location.search).get("lang");
    if (queryLang === "en" || queryLang === "vi") {
      return queryLang;
    }
    const stored = window.localStorage.getItem(STORAGE_LOCALE_KEY);
    if (stored === "en" || stored === "vi") {
      return stored;
    }
    const navLang = window.navigator.language?.toLowerCase() || "";
    return navLang.startsWith("vi") ? "vi" : "en";
  } catch {
    return "en";
  }
}

function detectInitialBilingual(initialLocale: Locale): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_BILINGUAL_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return initialLocale === "vi";
  } catch {
    return false;
  }
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());
  const [bilingualCards, setBilingualCardsState] = useState<boolean>(() =>
    detectInitialBilingual(detectInitialLocale())
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
    try {
      window.localStorage.setItem(STORAGE_LOCALE_KEY, locale);
    } catch {
      // Ignore storage errors
    }
  }, [locale]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_BILINGUAL_KEY, String(bilingualCards));
    } catch {
      // Ignore storage errors
    }
  }, [bilingualCards]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === "en" ? "vi" : "en"));
  }, []);

  const setBilingualCards = useCallback((enabled: boolean) => {
    setBilingualCardsState(enabled);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      bilingualCards,
      setBilingualCards,
      t: (key, params, fallback) => translateUi(locale, key, params, fallback),
      tCard: (card) => translateCard(locale, card),
      tChar: (ch) => translateCharacter(locale, ch),
      tEvent: (ev) => translateEvent(locale, ev),
      tRole: (role) => translateRoleName(locale, role),
      tSuitSymbol: (suit) => translateSuitSymbol(suit),
      tSuitName: (suit) => translateSuitName(locale, suit),
      tOutcome: (outcome) => translateOutcome(locale, outcome),
      tError: (err) => translateErrorMessage(locale, err),
      tLog: (entry) => formatStructuredLog(entry, locale),
    }),
    [locale, setLocale, toggleLocale, bilingualCards, setBilingualCards]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
