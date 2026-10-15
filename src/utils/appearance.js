/** Appearance options (must match the server's allowed values). */
export const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const ACCENTS = [
  { value: 'indigo', label: 'Indigo', swatch: '#4f46e5' },
  { value: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { value: 'sky', label: 'Sky', swatch: '#0284c7' },
  { value: 'teal', label: 'Teal', swatch: '#0d9488' },
  { value: 'emerald', label: 'Emerald', swatch: '#059669' },
  { value: 'amber', label: 'Amber', swatch: '#c2710c' },
  { value: 'rose', label: 'Rose', swatch: '#e11d48' },
];

export const FONT_SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

export const BUBBLE_STYLES = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'soft', label: 'Soft' },
  { value: 'square', label: 'Square' },
];

/** CSS-only wallpaper presets (classes in styles/index.css). */
export const WALLPAPER_PRESETS = [
  { value: 'preset:none', label: 'Plain' },
  { value: 'preset:dots', label: 'Dots' },
  { value: 'preset:grid', label: 'Grid' },
  { value: 'preset:waves', label: 'Waves' },
  { value: 'preset:sunset', label: 'Sunset' },
  { value: 'preset:ocean', label: 'Ocean' },
  { value: 'preset:forest', label: 'Forest' },
  { value: 'preset:lavender', label: 'Lavender' },
  { value: 'preset:night', label: 'Night' },
];

export const DEFAULT_APPEARANCE = { theme: 'system', accent: 'indigo', fontSize: 'medium', bubbleStyle: 'rounded', defaultWallpaper: null };
const STORAGE_KEY = 'temu:appearance';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export const resolveTheme = (theme) => (theme === 'system' ? (darkQuery().matches ? 'dark' : 'light') : theme);

let current = DEFAULT_APPEARANCE;
let unsubscribeSystem = null;

/** Apply appearance to <html> (data attributes drive the CSS) and remember it for the next visit. */
export function applyAppearance(appearance = DEFAULT_APPEARANCE) {
  current = { ...DEFAULT_APPEARANCE, ...appearance };
  const root = document.documentElement;
  const theme = resolveTheme(current.theme);
  root.dataset.theme = theme;
  root.dataset.accent = current.accent;
  root.dataset.font = current.fontSize;
  root.dataset.bubble = current.bubbleStyle;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121826' : '#ffffff');

  // "System" follows the OS live.
  unsubscribeSystem?.();
  unsubscribeSystem = null;
  if (current.theme === 'system') {
    const query = darkQuery();
    const onChange = () => applyAppearance(current);
    query.addEventListener('change', onChange);
    unsubscribeSystem = () => query.removeEventListener('change', onChange);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private mode / storage blocked: the theme still applies for this visit.
  }
}

/** Last applied appearance (from this browser), used before the server settings arrive. */
export function cachedAppearance() {
  try {
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** CSS class + inline style for a wallpaper value ('preset:…', 'custom:<id>' or null). */
export function wallpaperStyle(value, customWallpapers = []) {
  if (value?.startsWith('custom:')) {
    const custom = customWallpapers.find((w) => w.value === value);
    if (custom) {
      return {
        className: 'wallpaper wallpaper-custom',
        style: {
          backgroundImage: `linear-gradient(rgb(0 0 0 / var(--wall-dim)), rgb(0 0 0 / var(--wall-dim))), url("${custom.absoluteUrl}")`,
        },
      };
    }
  }
  const name = value?.startsWith('preset:') ? value.slice(7) : 'none';
  return { className: name === 'none' ? 'wallpaper' : `wallpaper wallpaper-${name}`, style: undefined };
}
