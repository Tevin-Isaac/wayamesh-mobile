import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Fresh biometric (or device passcode) check, used before anything that loosens protection: raising spending limits, the
 * agent mandate, or the accept limit. Resolves true only if the user authenticates. On a device with no lock screen or
 * biometrics enrolled there is nothing to ask, so it resolves true (the wallet key itself is then not auth-bound either).
 */
export async function requireReauth(reason = 'Confirm this change'): Promise<boolean> {
  try {
    const enrolled = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!enrolled) return true;
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
    return res.success;
  } catch {
    return false;
  }
}
