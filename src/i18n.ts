import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { ko } from "./locales/ko";

export const supportedLanguages = ["en", "ko"] as const;

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ko: { translation: ko } },
    supportedLngs: [...supportedLanguages],
    fallbackLng: "en",
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "locale",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
