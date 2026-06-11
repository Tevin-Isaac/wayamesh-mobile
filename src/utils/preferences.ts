import { getDb } from '@/db/schema';

export interface Preferences {
  biometric_enabled: boolean;
  auto_settle_enabled: boolean;
  language: string;
}

export function getPreferences(): Preferences {
  const row = getDb().getFirstSync<{
    biometric_enabled: number;
    auto_settle_enabled: number;
    language: string;
  }>('SELECT biometric_enabled, auto_settle_enabled, language FROM preferences WHERE id = 1');
  return {
    biometric_enabled: (row?.biometric_enabled ?? 1) === 1,
    auto_settle_enabled: (row?.auto_settle_enabled ?? 1) === 1,
    language: row?.language ?? 'en',
  };
}

export function setBiometric(enabled: boolean): void {
  getDb().runSync(
    'UPDATE preferences SET biometric_enabled = ? WHERE id = 1',
    [enabled ? 1 : 0],
  );
}

export function setAutoSettle(enabled: boolean): void {
  getDb().runSync(
    'UPDATE preferences SET auto_settle_enabled = ? WHERE id = 1',
    [enabled ? 1 : 0],
  );
}

export function setLanguage(lang: string): void {
  getDb().runSync(
    'UPDATE preferences SET language = ? WHERE id = 1',
    [lang],
  );
}
