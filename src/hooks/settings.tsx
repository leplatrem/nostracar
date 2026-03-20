import { useEffect, useLayoutEffect, useState } from 'react';

export interface NostrSettings {
  privateKey: string;
  setPrivateKey: (key: string) => void;
  relays: string[];
  setRelays: (relays: string[]) => void;
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

export function useSettings(): NostrSettings {
  const [privateKey, setPrivateKey] = useLocalStorage<string>('nostr-key', '');
  const [relays, setRelays] = useLocalStorage<string[]>('nostr-relays', [
    'wss://relay.damus.io',
    'wss://nos.lol',
  ]);

  const validRelays = relays.filter((r) => r.startsWith('wss://'));
  return { privateKey, setPrivateKey, relays: validRelays, setRelays };
}
