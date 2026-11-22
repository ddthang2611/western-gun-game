import { createContext } from "react";
import type {
  translateCard,
  translateCharacter,
  translateEvent,
} from "./resolvers";
import type { Locale, StructuredLogEntry, TranslationParams } from "./types";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  bilingualCards: boolean;
  setBilingualCards: (enabled: boolean) => void;
  t: (key: string, params?: TranslationParams, fallback?: string) => string;
  tCard: (card?: { templateId?: string; name?: string; desc?: string }) => ReturnType<
    typeof translateCard
  >;
  tChar: (char?: {
    id?: string;
    character_id?: string;
    name?: string;
    desc?: string;
  }) => ReturnType<typeof translateCharacter>;
  tEvent: (ev?: {
    id?: string;
    event_id?: string;
    effectCode?: string;
    name?: string;
    desc?: string;
  }) => ReturnType<typeof translateEvent>;
  tRole: (role?: string) => string;
  tSuitSymbol: (suit?: string) => string;
  tSuitName: (suit?: string) => string;
  tOutcome: (outcome?: string) => string;
  tError: (error?: { code?: string; message?: string; params?: TranslationParams } | string) => string;
  tLog: (entry: StructuredLogEntry) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
