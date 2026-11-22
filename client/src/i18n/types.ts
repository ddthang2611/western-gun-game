export type Locale = "en" | "vi";

export interface CardLocalization {
  name: string;
  subtitleVi?: string;
  desc: string;
  symbolDesc?: string;
  actionSummary?: string;
}

export interface CharacterLocalization {
  name: string;
  desc: string;
  symbolDesc?: string;
}

export interface EventLocalization {
  name: string;
  subtitleVi?: string;
  desc: string;
}

export interface StructuredLogEntry {
  id: string;
  eventType: string;
  params: Record<string, unknown>;
  fallbackText: string;
}

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
