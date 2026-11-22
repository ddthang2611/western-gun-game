import { EN_LOCALE_BUNDLE } from "./locales/en";
import { VI_LOCALE_BUNDLE } from "./locales/vi";
import type {
  CardLocalization,
  CharacterLocalization,
  EventLocalization,
  Locale,
  TranslationParams,
} from "./types";

const BUNDLES = {
  en: EN_LOCALE_BUNDLE,
  vi: VI_LOCALE_BUNDLE,
} as const;

const CHAR_ID_BY_NAME: Record<string, string> = {};
for (const [id, item] of Object.entries(EN_LOCALE_BUNDLE.characters)) {
  CHAR_ID_BY_NAME[item.name.toLowerCase()] = id;
}

const EVENT_ID_BY_NAME: Record<string, string> = {};
for (const [id, item] of Object.entries(EN_LOCALE_BUNDLE.events)) {
  EVENT_ID_BY_NAME[item.name.toLowerCase()] = id;
}

const CARD_ALIAS_MAP: Record<string, string> = {
  "REV CARABINE": "REV. CARABINE",
  CARABINE: "REV. CARABINE",
  MISSED: "MISSED!",
  BANG: "BANG!",
  PANIC: "PANIC!",
  INDIANS: "INDIANS!",
};

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const val = params[key];
    return val === undefined || val === null ? "" : String(val);
  });
}

export function translateUi(
  locale: Locale,
  key: string,
  params?: TranslationParams,
  fallback?: string
): string {
  const dict = BUNDLES[locale].ui;
  const enDict = BUNDLES.en.ui;
  const template = dict[key] ?? enDict[key] ?? fallback ?? key;
  return interpolate(template, params);
}

function resolveCanonicalCardName(templateId?: string, name?: string): string | undefined {
  if (templateId && EN_LOCALE_BUNDLE.templateIdToName[templateId]) {
    return EN_LOCALE_BUNDLE.templateIdToName[templateId];
  }
  if (!name) return undefined;
  const normalized = name.trim().toUpperCase();
  if (EN_LOCALE_BUNDLE.cards[normalized]) return normalized;
  return CARD_ALIAS_MAP[normalized] ?? normalized;
}

export function translateCard(
  locale: Locale,
  input?: { templateId?: string; name?: string; desc?: string }
): { primary: CardLocalization; secondary?: CardLocalization } {
  const canonicalName = resolveCanonicalCardName(input?.templateId, input?.name);
  const bundle = BUNDLES[locale];
  const otherLocale: Locale = locale === "vi" ? "en" : "vi";
  const otherBundle = BUNDLES[otherLocale];

  const primaryHit = canonicalName ? bundle.cards[canonicalName] : undefined;
  const secondaryHit = canonicalName ? otherBundle.cards[canonicalName] : undefined;

  const primary: CardLocalization = primaryHit ?? {
    name: input?.name || canonicalName || "",
    desc: input?.desc || "",
  };

  return {
    primary,
    secondary: secondaryHit,
  };
}

export function translateCharacter(
  locale: Locale,
  input?: { id?: string; character_id?: string; name?: string; desc?: string }
): { primary: CharacterLocalization; secondary?: CharacterLocalization } {
  const idFromProp = input?.id || input?.character_id;
  const resolvedId =
    (idFromProp && EN_LOCALE_BUNDLE.characters[idFromProp] ? idFromProp : undefined) ??
    (input?.name ? CHAR_ID_BY_NAME[input.name.trim().toLowerCase()] : undefined);

  const bundle = BUNDLES[locale];
  const otherLocale: Locale = locale === "vi" ? "en" : "vi";
  const primary = (resolvedId && bundle.characters[resolvedId]) || {
    name: input?.name || "",
    desc: input?.desc || "",
  };
  const secondary = resolvedId ? BUNDLES[otherLocale].characters[resolvedId] : undefined;

  return { primary, secondary };
}

export function translateEvent(
  locale: Locale,
  input?: { id?: string; event_id?: string; effectCode?: string; name?: string; desc?: string }
): { primary: EventLocalization; secondary?: EventLocalization } {
  const idFromProp = input?.id || input?.event_id;
  const codeId = input?.effectCode?.startsWith("EVENT_")
    ? input.effectCode.slice(6).toLowerCase()
    : undefined;
  const resolvedId =
    (idFromProp && EN_LOCALE_BUNDLE.events[idFromProp] ? idFromProp : undefined) ??
    (codeId && EN_LOCALE_BUNDLE.events[codeId] ? codeId : undefined) ??
    (input?.name ? EVENT_ID_BY_NAME[input.name.trim().toLowerCase()] : undefined);

  const bundle = BUNDLES[locale];
  const otherLocale: Locale = locale === "vi" ? "en" : "vi";
  const primary = (resolvedId && bundle.events[resolvedId]) || {
    name: input?.name || "",
    desc: input?.desc || "",
  };
  const secondary = resolvedId ? BUNDLES[otherLocale].events[resolvedId] : undefined;

  return { primary, secondary };
}

export function translateSuitSymbol(suit?: string): string {
  switch ((suit || "").toLowerCase()) {
    case "spades":
    case "s":
      return "♠";
    case "clubs":
    case "c":
      return "♣";
    case "hearts":
    case "h":
      return "♥";
    case "diamonds":
    case "d":
      return "♦";
    default:
      return "";
  }
}

export function translateSuitName(locale: Locale, suit?: string): string {
  const s = (suit || "").toLowerCase();
  if (s === "spades" || s === "s") return translateUi(locale, "suits.spades");
  if (s === "clubs" || s === "c") return translateUi(locale, "suits.clubs");
  if (s === "hearts" || s === "h") return translateUi(locale, "suits.hearts");
  if (s === "diamonds" || s === "d") return translateUi(locale, "suits.diamonds");
  return suit || "";
}

export function translateRoleName(locale: Locale, role?: string): string {
  const r = (role || "unknown").toLowerCase();
  return translateUi(locale, `roles.${r}`, undefined, role || "Unknown");
}

export function translateOutcome(locale: Locale, outcome?: string): string {
  if (!outcome) return "";
  return translateUi(locale, `outcomes.${outcome.toUpperCase()}`, undefined, outcome);
}

export function translateErrorMessage(
  locale: Locale,
  error?: { code?: string; message?: string; params?: TranslationParams } | string
): string {
  const errorsDict = BUNDLES[locale].errors;
  const enDict = BUNDLES.en.errors;

  if (typeof error === "string") {
    return matchLegacyError(locale, error);
  }
  if (!error) {
    return errorsDict.UNKNOWN_ERROR ?? enDict.UNKNOWN_ERROR;
  }
  if (error.code && (errorsDict[error.code] || enDict[error.code])) {
    return interpolate(errorsDict[error.code] ?? enDict[error.code], error.params);
  }
  if (error.message) {
    return matchLegacyError(locale, error.message);
  }
  return errorsDict.UNKNOWN_ERROR ?? enDict.UNKNOWN_ERROR;
}

function matchLegacyError(locale: Locale, msg: string): string {
  const errorsDict = BUNDLES[locale].errors;
  const trimmed = msg.trim();
  if (!trimmed) return errorsDict.UNKNOWN_ERROR;

  const lockMatch = trimmed.match(/locked for (\d+)\s*seconds/i);
  if (lockMatch && trimmed.toLowerCase().includes("unlock")) {
    return interpolate(errorsDict.DB_UNLOCK_RATE_LIMITED, { seconds: lockMatch[1] });
  }
  const accountMatch = trimmed.match(/try again in (\d+)/i);
  if (accountMatch) {
    return interpolate(errorsDict.ACCOUNT_LOCKED, { seconds: accountMatch[1] });
  }
  const minPlayersMatch = trimmed.match(/at least (\d+) players/i);
  if (minPlayersMatch) {
    return interpolate(errorsDict.NOT_ENOUGH_PLAYERS, { min: minPlayersMatch[1] });
  }

  for (const [code, enText] of Object.entries(BUNDLES.en.errors)) {
    if (enText.replace(/\.$/, "").toLowerCase() === trimmed.replace(/\.$/, "").toLowerCase()) {
      return errorsDict[code] ?? trimmed;
    }
  }
  return msg;
}
