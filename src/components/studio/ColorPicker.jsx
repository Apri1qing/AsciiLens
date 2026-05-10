import React, { useRef } from 'react';
import { Check, Palette } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

const COLOR_MODE_OPTIONS = [
  { id: 'original', labelKey: 'colorOriginal', descKey: 'colorOriginalDesc' },
  { id: 'mono', labelKey: 'colorMono', descKey: 'colorMonoDesc' },
];

const QUICK_SWATCHES = ['#fffdfd', '#ffa5c6', '#8bd643', '#0000ee', '#fff4c2', '#ff7a90', '#b9a7ff', '#9ff3ff'];

export default function ColorPicker({ value = 'mono', monoColor = '#fffdfd', onModeChange, onMonoColorChange }) {
  const { t } = useLang();
  const colorInputRef = useRef(null);
  const activeMode = value === 'original' ? 'original' : 'mono';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {COLOR_MODE_OPTIONS.map((option) => {
          const active = activeMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModeChange(option.id)}
              aria-pressed={active}
              aria-label={`${t(option.labelKey)} ${t(option.descKey)}`}
              className={`relative min-h-[54px] rounded-[4px] border px-2.5 py-2 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                ${active ? 'border-primary/60 bg-primary/10 text-foreground shadow-[0_0_18px_hsl(var(--primary)/0.1)]' : 'border-border/60 bg-muted/70 text-muted-foreground hover:border-primary/35 hover:text-foreground'}`}
            >
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">{t(option.labelKey)}</div>
              {active && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/75 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeMode === 'mono' && (
        <div className="rounded-[6px] border border-border/65 bg-background/45 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border/70 bg-muted/70 px-2 py-1.5 text-left transition-colors hover:border-primary/45 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span
                className="h-5 w-5 flex-shrink-0 rounded-full border border-border shadow-[0_0_14px_currentColor]"
                style={{ backgroundColor: monoColor, color: monoColor }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/80">
                {monoColor}
              </span>
              <Palette className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={monoColor}
              aria-label={t('monoColorPicker')}
              className="sr-only"
              onChange={(event) => onMonoColorChange(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-8 gap-1">
            {QUICK_SWATCHES.map((color) => {
              const active = monoColor.toLowerCase() === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`${t('selectMonoColor')} ${color}`}
                  aria-pressed={active}
                  onClick={() => onMonoColorChange(color)}
                  className={`h-6 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    ${active ? 'border-primary ring-1 ring-primary/60' : 'border-border/70 hover:border-primary/45'}`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
