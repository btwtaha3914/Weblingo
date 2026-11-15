/** Display catalogue. Whether a language can actually be translated is decided by the LibreTranslate server (/api/languages). */
export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

export const LANGUAGE_CATALOG: LanguageInfo[] = [
  { code: "en", name: "English", nativeName: "English", rtl: false },
  { code: "es", name: "Spanish", nativeName: "Español", rtl: false },
  { code: "fr", name: "French", nativeName: "Français", rtl: false },
  { code: "de", name: "German", nativeName: "Deutsch", rtl: false },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "ur", name: "Urdu", nativeName: "اردو", rtl: true },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文", rtl: false },
  { code: "zh-tw", name: "Chinese (Traditional)", nativeName: "繁體中文", rtl: false },
  { code: "it", name: "Italian", nativeName: "Italiano", rtl: false },
  { code: "pt", name: "Portuguese", nativeName: "Português", rtl: false },
  { code: "pt-br", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", rtl: false },
  { code: "ru", name: "Russian", nativeName: "Русский", rtl: false },
  { code: "ja", name: "Japanese", nativeName: "日本語", rtl: false },
  { code: "ko", name: "Korean", nativeName: "한국어", rtl: false },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", rtl: false },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", rtl: false },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", rtl: false },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", rtl: false },
  { code: "pl", name: "Polish", nativeName: "Polski", rtl: false },
  { code: "sv", name: "Swedish", nativeName: "Svenska", rtl: false },
  { code: "da", name: "Danish", nativeName: "Dansk", rtl: false },
  { code: "nb", name: "Norwegian", nativeName: "Norsk bokmål", rtl: false },
  { code: "fi", name: "Finnish", nativeName: "Suomi", rtl: false },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", rtl: false },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", rtl: false },
  { code: "th", name: "Thai", nativeName: "ไทย", rtl: false },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", rtl: false },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", rtl: false },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", rtl: false },
  { code: "cs", name: "Czech", nativeName: "Čeština", rtl: false },
  { code: "ro", name: "Romanian", nativeName: "Română", rtl: false },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", rtl: false },
  { code: "bg", name: "Bulgarian", nativeName: "Български", rtl: false },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina", rtl: false },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", rtl: false },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog", rtl: false },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycan", rtl: false },
  { code: "ca", name: "Catalan", nativeName: "Català", rtl: false },
];

export function languageInfo(code: string): LanguageInfo {
  const lower = code.toLowerCase();
  return (
    LANGUAGE_CATALOG.find((l) => l.code === lower) || {
      code: lower,
      name: lower.toUpperCase(),
      nativeName: lower.toUpperCase(),
      rtl: ["ar", "ur", "he", "fa", "ps", "sd", "ug", "yi"].includes(lower.split("-")[0]),
    }
  );
}
