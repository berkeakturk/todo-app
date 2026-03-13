import { useEffect } from 'react';
import { useLocalStorage } from './use-local-storage';

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('todo-theme', 
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return { theme, toggle };
}
