/**
 * Tiny i18n over the SAME locale files the phone app ships (src/i18n/locales/*.ts, copied verbatim).
 * `t('wallet.send')`, with {{var}} interpolation, falling back to English and then to the supplied default.
 */
import { useSyncExternalStore } from 'react'
import en from '../i18n/locales/en'
import sw from '../i18n/locales/sw'
import ha from '../i18n/locales/ha'
import fr from '../i18n/locales/fr'
import pt from '../i18n/locales/pt'
import es from '../i18n/locales/es'
import ar from '../i18n/locales/ar'
import ko from '../i18n/locales/ko'
import zh from '../i18n/locales/zh'
import { LANG_KEY } from './store'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'sw', name: 'Kiswahili', flag: '🇰🇪' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ar', name: 'العربية', flag: '🇦🇪' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

const LOCALES: Record<string, unknown> = { en, sw, ha, fr, pt, es, ar, ko, zh }

function lookup(locale: unknown, key: string): unknown {
  let cur: any = locale
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

export function translate(lang: string, key: string, vars?: Record<string, string | number>, fallback?: string): string {
  const raw = lookup(LOCALES[lang], key) ?? lookup(en, key)
  let out = typeof raw === 'string' ? raw : (fallback ?? key)
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, String(v))
  return out
}

let lang: string = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    return saved && LOCALES[saved] ? saved : 'en'
  } catch {
    return 'en'
  }
})()
const listeners = new Set<() => void>()

export function getLang() {
  return lang
}

export function setLang(code: string) {
  if (!LOCALES[code]) return
  lang = code
  try {
    localStorage.setItem(LANG_KEY, code)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr'
  }
  listeners.forEach((l) => l())
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export function useT() {
  const l = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => lang,
    () => 'en',
  )
  return {
    lang: l,
    t: (key: string, fallback?: string, vars?: Record<string, string | number>) => translate(l, key, vars, fallback),
  }
}
