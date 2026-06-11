import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import sw from './locales/sw';
import ha from './locales/ha';
import fr from './locales/fr';
import pt from './locales/pt';
import es from './locales/es';
import ar from './locales/ar';
import ko from './locales/ko';
import zh from './locales/zh';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',    flag: '🇺🇸' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ha', name: 'Hausa',     flag: '🇳🇬' },
  { code: 'fr', name: 'Français',  flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'es', name: 'Español',   flag: '🇪🇸' },
  { code: 'ar', name: 'العربية',   flag: '🇦🇪' },
  { code: 'ko', name: '한국어',     flag: '🇰🇷' },
  { code: 'zh', name: '中文',       flag: '🇨🇳' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

i18n
  .use(initReactI18next)
  .init({
    resources: { en, sw, ha, fr, pt, es, ar, ko, zh },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

export default i18n;
