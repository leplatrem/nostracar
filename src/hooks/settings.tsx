import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

export interface RelayEntry {
  url: string;
  enabled: boolean;
}

export interface NostrSettings {
  privateKey: string;
  setPrivateKey: (key: string) => void;
  /** Enabled wss:// relays only — use for all nostr operations */
  relays: string[];
  /** All stored relay entries — use for the settings UI */
  rawRelays: RelayEntry[];
  setRelays: (relays: RelayEntry[]) => void;
}

export type ThemeMode = 'light' | 'dark' | 'auto';

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Check localStorage immediately during initialization
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem('theme-mode') as ThemeMode) || 'auto';
  });

  // useLayoutEffect prevents the white flash on page load by applying
  // the class before the browser draws the pixels.
  useLayoutEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      let colorMode: 'light' | 'dark' = 'light';

      if (mode === 'auto') {
        colorMode = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      } else {
        colorMode = mode;
      }

      if (colorMode === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    localStorage.setItem('theme-mode', mode);

    // If auto, listen for system changes
    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  return [mode, setMode] as const;
}

function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const DEFAULT_RELAYS: RelayEntry[] = [
  { url: 'wss://relay.damus.io', enabled: true },
  { url: 'wss://nos.lol', enabled: false },
  { url: 'wss://nostr.swiss-enigma.ch', enabled: false },
  { url: 'wss://nostr.einundzwanzig.space', enabled: false },
  { url: 'wss://offchain.pub', enabled: false },
  { url: 'wss://relay.primal.net', enabled: false },
  { url: 'wss://relay.nsec.app', enabled: false },
];

export function useSettings(): NostrSettings {
  const [privateKey, setPrivateKey] = useLocalStorage<string>(
    'nostr-key-v0',
    ''
  );
  const [rawData, setRelays] = useLocalStorage<RelayEntry[] | string[]>(
    'nostr-relays-v0',
    DEFAULT_RELAYS
  );

  const rawRelays: RelayEntry[] = rawData as RelayEntry[];
  const relays = useMemo(() => {
    return rawRelays
      .filter((e) => e.enabled && e.url.startsWith('wss://'))
      .map((e) => e.url);
  }, [rawRelays]);

  return {
    privateKey,
    setPrivateKey,
    relays,
    rawRelays,
    setRelays: setRelays as (relays: RelayEntry[]) => void,
  };
}
