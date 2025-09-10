import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem('theme-mode') as ThemeMode) || 'auto';
  });

  useEffect(() => {
    const root = document.documentElement;

    function apply(mode: ThemeMode) {
      if (mode === 'light') {
        root.classList.remove('dark');
      } else if (mode === 'dark') {
        root.classList.add('dark');
      } else {
        // auto: follow system
        const prefersDark = window.matchMedia(
          '(prefers-color-scheme: dark)'
        ).matches;
        if (prefersDark) root.classList.add('dark');
        else root.classList.remove('dark');
      }
    }

    apply(mode);

    localStorage.setItem('theme-mode', mode);

    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply('auto');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  return [mode, setMode] as const;
}
