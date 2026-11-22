import React from "react";
import { useI18n } from "../useI18n";
import "./LanguageSwitcher.scss";

interface LanguageSwitcherProps {
  compact?: boolean;
  showBilingualToggle?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  compact = false,
  showBilingualToggle = true,
}) => {
  const { locale, setLocale, bilingualCards, setBilingualCards, t } = useI18n();

  return (
    <div className={`wg-lang-switcher ${compact ? "wg-lang-switcher--compact" : ""}`}>
      <div className="wg-lang-switcher__pills" role="group" aria-label={t("common.language")}>
        <button
          type="button"
          className={`wg-lang-switcher__btn ${locale === "en" ? "is-active" : ""}`}
          onClick={() => setLocale("en")}
        >
          EN
        </button>
        <button
          type="button"
          className={`wg-lang-switcher__btn ${locale === "vi" ? "is-active" : ""}`}
          onClick={() => setLocale("vi")}
        >
          VI
        </button>
      </div>

      {showBilingualToggle && (
        <button
          type="button"
          className={`wg-lang-switcher__bilingual ${bilingualCards ? "is-active" : ""}`}
          onClick={() => setBilingualCards(!bilingualCards)}
          title={t("common.bilingualCards")}
        >
          {compact ? t("common.bilingualShort") : t("common.bilingualCards")}
        </button>
      )}
    </div>
  );
};
