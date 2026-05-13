import React from 'react';
import { Download, RefreshCw, Loader2, Eraser, Square, Circle, PenLine, Check, Palette } from 'lucide-react';
import ControlSlider from './ControlSlider';
import CharSetPicker from './CharSetPicker';
import ColorPicker from './ColorPicker';
import { useLang } from '@/lib/LanguageContext';

const IMAGE_FILTER_SWATCHES = ['#fffdfd', '#ffa5c6', '#8bd643', '#0000ee', '#fff4c2', '#ff7a90', '#b9a7ff', '#9ff3ff'];

export default function EditorPanel({
  settings,
  renderMode,
  onChange,
  onReset,
  onResetEffects,
  canvasRef,
  isProcessing,
  hasResult,
  shapeMode,
  onShapeModeChange,
}) {
  const { t } = useLang();
  const handleDownload = () => canvasRef.current?.download();
  const mode = renderMode || settings.mode;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Panel Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border/80 bg-card/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">{t('editorArea')}</span>
        </div>
        {isProcessing && (
          <div className="flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase">
            <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
            <span className="text-primary">{t('rendering')}</span>
          </div>
        )}
      </div>

      {/* Scrollable controls */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">

        {/* ── Render Mode ── */}
        <Section label={t('modeLabel')}>
          <div className="grid grid-cols-2 gap-1">
            {[
              { id: 'overlay', label: t('modeOverlay'), desc: t('modeOverlayDesc') },
              { id: 'full',    label: t('modeFull'),    desc: t('modeFullDesc') },
            ].map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onChange('mode', m.id)}
                  aria-pressed={active}
                  aria-label={`${m.label} ${m.desc}`}
                  className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    ${active
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.12)]'
                      : 'border-border/65 bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                >
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">{m.label}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Selection Tools (overlay only) ── */}
        {mode === 'overlay' && (
          <Section label={t('selectionTool')}>
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'rect',     icon: Square,  label: t('shapeRect') },
                { id: 'circle',   icon: Circle,  label: t('shapeEllipse') },
                { id: 'freehand', icon: PenLine, label: t('shapeFree') },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => onShapeModeChange(id)}
                  aria-pressed={shapeMode === id}
                  aria-label={label}
                  className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border px-1 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    ${shapeMode === id
                      ? 'bg-primary text-primary-foreground ring-1 ring-primary border-primary'
                      : 'bg-muted text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/80'}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="max-w-full truncate font-mono text-[7px] tracking-widest uppercase">{label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── ASCII Color ── */}
        <Section label={t('asciiColor')}>
          <ColorPicker
            value={settings.colorMode}
            monoColor={settings.monoColor}
            onModeChange={(v) => onChange('colorMode', v)}
            onMonoColorChange={(v) => onChange('monoColor', v)}
          />
        </Section>

        {/* ── ASCII Characters ── */}
        <Section label={t('asciiCharacters')}>
          <CharSetPicker
            charSet={settings.charSet}
            customChars={settings.customChars}
            onCharSetChange={(v) => onChange('charSet', v)}
            onCustomCharsChange={(v) => onChange('customChars', v)}
          />
        </Section>

        {/* ── ASCII Density ── */}
        <Section label={t('asciiDensity')}>
          <ControlSlider
            label={t('columns')}
            value={settings.resolution}
            min={30} max={160}
            onChange={(v) => onChange('resolution', v)}
            displayValue={`${Math.round(settings.resolution)}`}
          />
        </Section>

        {/* ── ASCII Light & Tone ── */}
        <Section label={t('asciiLightTone')}>
          <ControlSlider label={t('brightness')} value={settings.brightness} min={0} max={100} onChange={(v) => onChange('brightness', v)} />
          <ControlSlider label={t('contrast')}   value={settings.contrast}   min={0} max={100} onChange={(v) => onChange('contrast', v)} />
          <ControlSlider label={t('glow')}     value={settings.glowStrength}     min={0} max={100} onChange={(v) => onChange('glowStrength', v)} />
          <ToggleRow label={t('invertLight')} value={settings.invertLight} onChange={(v) => onChange('invertLight', v)} />
        </Section>

        {/* ── Image Layer ── */}
        <Section label={t('imageLayer')}>
          {mode === 'overlay' && (
            <>
              <ImageFilterPicker
                mode={settings.imageFilterMode}
                color={settings.imageFilterColor}
                onModeChange={(v) => onChange('imageFilterMode', v)}
                onColorChange={(v) => onChange('imageFilterColor', v)}
              />
              <ControlSlider label={t('bgBlur')} value={settings.bgBlur} min={0} max={12} onChange={(v) => onChange('bgBlur', v)} displayValue={`${settings.bgBlur}px`} />
              <ControlSlider label={t('bgDim')}  value={settings.bgDim}  min={0} max={80} onChange={(v) => onChange('bgDim', v)}  displayValue={`${settings.bgDim}%`} />
            </>
          )}
          <ControlSlider label={t('vignette')} value={settings.vignetteStrength} min={0} max={100} onChange={(v) => onChange('vignetteStrength', v)} />
        </Section>

      </div>

      {/* Footer */}
      <div className="flex-shrink-0 space-y-2 border-t border-border/80 px-4 py-3">
        <button
          onClick={handleDownload}
          disabled={!hasResult}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-secondary py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-secondary-foreground transition-all duration-200 hover:bg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-25"
        >
          <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <Download className="w-3.5 h-3.5" />
          {t('exportPng')}
        </button>
        <button
          onClick={onResetEffects}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-transparent py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-200 hover:border-border hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Eraser className="w-3 h-3" />
          {t('resetEffects') || 'RESET EFFECTS'}
        </button>
        <button
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-transparent py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-200 hover:border-border hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <RefreshCw className="w-3 h-3" />
          {t('newImage')}
        </button>
      </div>
    </div>
  );
}

function ImageFilterPicker({
  mode = 'original',
  color = '#fffdfd',
  onModeChange,
  onColorChange,
}) {
  const { t } = useLang();
  const colorInputRef = React.useRef(null);
  const activeMode = mode === 'mono' || mode === 'bw' ? 'mono' : 'original';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1">
        {[
          { id: 'original', label: t('imageFilterOriginal') },
          { id: 'mono', label: t('imageFilterMono') },
        ].map((option) => {
          const active = activeMode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onModeChange(option.id)}
              aria-pressed={active}
              aria-label={option.label}
              className={`relative min-h-9 rounded-[5px] border px-2 py-2 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                ${active
                  ? 'border-primary/65 bg-primary/10 text-foreground shadow-[0_0_16px_hsl(var(--primary)/0.1)]'
                  : 'border-border/60 bg-muted/70 text-muted-foreground hover:border-primary/35 hover:text-foreground'
                }`}
            >
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em]">{option.label}</span>
              {active && (
                <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background/80 text-primary">
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
                style={{ backgroundColor: color, color }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/80">
                {color}
              </span>
              <Palette className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={color}
              aria-label={t('imageFilterColorPicker')}
              className="sr-only"
              onChange={(event) => onColorChange(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-8 gap-1">
            {IMAGE_FILTER_SWATCHES.map((swatch) => {
              const active = color.toLowerCase() === swatch;
              return (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`${t('selectImageFilterColor')} ${swatch}`}
                  aria-pressed={active}
                  onClick={() => onColorChange(swatch)}
                  className={`h-6 rounded-full border transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                    ${active ? 'border-primary ring-1 ring-primary/60' : 'border-border/70 hover:border-primary/45'}`}
                  style={{ backgroundColor: swatch }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-[0.24em] text-foreground/70 uppercase whitespace-nowrap">{label}</span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">{label}</span>
      <button
        onClick={() => onChange(!value)}
        aria-pressed={value}
        aria-label={label}
        className={`relative h-4 w-8 flex-shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${value ? 'bg-primary' : 'bg-secondary border border-border'}`}
      >
        <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-all duration-200 ${value ? 'left-4 bg-primary-foreground' : 'left-0.5 bg-muted-foreground'}`} />
      </button>
    </div>
  );
}
