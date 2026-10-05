export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'crm_theme';
const THEME_EVENT = 'crm-theme-change';

/**
 * Runs in <head> before the page paints, so a dark-mode user never sees a
 * white flash. Uses the saved choice, else the device setting.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export const getTheme = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

export const setTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or storage blocked: the theme still applies for this visit.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
};

/** Calls `fn` whenever the theme changes in this tab. Returns an unsubscribe. */
export const onThemeChange = (fn: () => void) => {
  window.addEventListener(THEME_EVENT, fn);
  return () => window.removeEventListener(THEME_EVENT, fn);
};
