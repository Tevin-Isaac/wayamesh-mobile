import * as Clipboard from 'expo-clipboard';

/**
 * Copy text to clipboard and automatically clear it after `clearAfterMs` milliseconds.
 * Default: 30 seconds. Prevents sensitive data (addresses, seed words) from lingering.
 */
export async function copyWithAutoClear(
  text: string,
  clearAfterMs = 30_000,
): Promise<void> {
  await Clipboard.setStringAsync(text);
  setTimeout(() => Clipboard.setStringAsync(''), clearAfterMs);
}
