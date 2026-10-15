import { useState } from 'react';
import { Check, Image as ImageIcon } from 'lucide-react';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { ACCENTS, BUBBLE_STYLES, DEFAULT_APPEARANCE, FONT_SIZES, THEMES, WALLPAPER_PRESETS, wallpaperStyle } from '../../utils/appearance.js';
import { cn } from '../../utils/misc.js';
import { PanelSection } from '../layout/Panel.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { useToast } from '../ui/Toast.jsx';
import { WallpaperPicker } from './WallpaperPicker.jsx';

/** Theme, accent colour, text size, bubble shape and default wallpaper — applied instantly. */
export function AppearanceSettings() {
  const { settings, wallpapers } = useChatState();
  const { updateAppearance } = useChatActions();
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const appearance = settings?.appearance ?? DEFAULT_APPEARANCE;

  const set = (fields) => updateAppearance(fields).catch((error) => toast.error(error.message));
  const wallpaperValue = appearance.defaultWallpaper ?? 'preset:none';
  const wallpaperLabel = wallpaperValue.startsWith('custom:')
    ? 'Your photo'
    : (WALLPAPER_PRESETS.find((w) => w.value === wallpaperValue)?.label ?? 'Plain');
  const look = wallpaperStyle(wallpaperValue, wallpapers);

  return (
    <PanelSection title="Appearance">
      <Segmented label="Theme" options={THEMES} value={appearance.theme} onChange={(theme) => set({ theme })} />

      <div className="py-2">
        <p className="mb-1.5 text-sm font-medium text-ink">Accent colour</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((accent) => (
            <button
              key={accent.value}
              type="button"
              role="radio"
              aria-checked={appearance.accent === accent.value}
              aria-label={accent.label}
              title={accent.label}
              onClick={() => set({ accent: accent.value })}
              className={cn(
                'flex size-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-transform hover:scale-110',
                appearance.accent === accent.value && 'ring-2 ring-ink-soft',
              )}
              style={{ backgroundColor: accent.swatch }}
            >
              {appearance.accent === accent.value && <Check className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      <Segmented label="Text size" options={FONT_SIZES} value={appearance.fontSize} onChange={(fontSize) => set({ fontSize })} />
      <Segmented label="Message bubbles" options={BUBBLE_STYLES} value={appearance.bubbleStyle} onChange={(bubbleStyle) => set({ bubbleStyle })} />

      <div className="py-2">
        <p className="mb-1.5 text-sm font-medium text-ink">Chat wallpaper</p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center gap-3 rounded-control border border-line p-2 text-left hover:bg-surface-muted"
        >
          <span className={cn('h-14 w-10 shrink-0 rounded-md border border-line', look.className)} style={look.style} aria-hidden />
          <span className="flex-1">
            <span className="block text-sm text-ink">{wallpaperLabel}</span>
            <span className="text-xs text-ink-muted">Default for all chats. Change it per chat from the chat menu.</span>
          </span>
          <ImageIcon className="size-4 text-ink-faint" aria-hidden />
        </button>
      </div>

      {pickerOpen && (
        <WallpaperPicker
          title="Default chat wallpaper"
          value={wallpaperValue}
          onChoose={(value) => updateAppearance({ defaultWallpaper: value })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </PanelSection>
  );
}
