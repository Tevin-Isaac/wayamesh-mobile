import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Real connectivity, kept live. NetInfo watches the radio AND actively checks that the internet is reachable
 * (a Wi-Fi network with no internet reads as offline), so the label flips as soon as the connection changes.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const apply = (s: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      setOnline(!!s.isConnected && s.isInternetReachable !== false);
    NetInfo.fetch().then(apply).catch(() => {});
    return NetInfo.addEventListener(apply);
  }, []);
  return online;
}
