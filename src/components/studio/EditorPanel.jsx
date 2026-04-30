import React from 'react';
import { Download, RefreshCw, Loader2, Eraser, Square, Circle, PenLine, X } from 'lucide-react';
import ControlSlider from './ControlSlider';
import CharSetPicker from './CharSetPicker';
import ColorPicker from './ColorPicker';
import { useLang } from '@/lib/LanguageContext';

export default function EditorPanel({ settings, onChange, onReset, onResetEffects, canvasRef, isProcessing, hasResult, shapeMode, onShapeModeChange, onClearSelection, hasSelection }) {
  const { t } = useLang();
  const handleDownload = () => canvasRef.current?.download();

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">{t('controls')}</span>
          <span className="text-primary/30 font-mono text-[9px]">//</span>
          <span className="font-mono text-[9px] tracking-widest text-primary/60 uppercase">ASCII Studio</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase transition-opacity duration-300 ${isProcessing ? 'opacity-100' : 'opacity-0'}`}>
          <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
          <span className="text-primary">{t('rendering')}</span>
        </div>
      </div>

      {/* Scrollable controls */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 min-h-0">

        {/* ── Color (first) ── */}
        <Section label={t('color')}>
          <ColorPicker value={settings.colorMode} onChange={(v) => onChange('colorMode', v)} />
        </Section>

        {/* ── Render Mode ── */}
        <Section label={t('modeLabel')}>
          <div className="grid grid-cols-2 gap-1">
            {[
              { id: 'overlay', label: t('modeOverlay'), desc: t('modeOverlayDesc') },
              { id: 'full',    label: t('modeFull'),    desc: t('modeFullDesc') },
            ].map((m) => {
              const active = settings.mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onChange('mode', m.id)}
                  className={`px-2 py-2 text-left transition-all duration-150
                    ${active
                      ? 'bg-primary/10 ring-1 ring-primary text-primary'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    }`}
                >
                  <div className="font-mono text-[9px] tracking-widest uppercase font-bold">{m.label}</div>
                  <div className="font-mono text-[8px] text-muted-foreground mt-0.5 leading-tight">{m.desc}</div>
                </button>
              );
            })}
          </div>
          {settings.mode === 'overlay' && (
            <p className="font-mono text-[8px] text-muted-foreground/60 tracking-widest uppercase leading-relaxed">
              {t('drawHint') || 'Draw on canvas to select subject'}
            </p>
          )}
        </Section>

        {/* ── Characters ── */}
        <Section label={t('characters')}>
          <CharSetPicker
            charSet={settings.charSet}
            customChars={settings.customChars}
            onCharSetChange={(v) => onChange('charSet', v)}
            onCustomCharsChange={(v) => onChange('customChars', v)}
          />
        </Section>

        {/* ── Light & Tone ── */}
        <Section label={t('lightTone')}>
          <ControlSlider label={t('brightness')} value={settings.brightness} min={0} max={100} onChange={(v) => onChange('brightness', v)} />
          <ControlSlider label={t('contrast')}   value={settings.contrast}   min={0} max={100} onChange={(v) => onChange('contrast', v)} />
          <ToggleRow label={t('invertLight')} value={settings.invertLight} onChange={(v) => onChange('invertLight', v)} />
        </Section>

        {/* ── Selection Tools (overlay only) ── */}
        {settings.mode === 'overlay' && (
          <Section label="Selection Tool">
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: 'rect',     icon: Square,  label: 'RECT' },
                { id: 'circle',   icon: Circle,  label: 'ELLIPSE' },
                { id: 'freehand', icon: PenLine, label: 'FREE' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => onShapeModeChange(id)}
                  className={`flex flex-col items-center gap-1 py-2 transition-all duration-150 border
                    ${shapeMode === id
                      ? 'bg-primary/10 ring-1 ring-primary text-primary border-primary/30'
                      : 'bg-muted text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/80'}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="font-mono text-[7px] tracking-widest">{label}</span>
                </button>
              ))}
            </div>
            {hasSelection && (
              <button
                onClick={onClearSelection}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 font-mono text-[8px] tracking-widest uppercase text-muted-foreground hover:text-destructive transition-colors border border-transparent hover:border-destructive/30"
              >
                <X className="w-2.5 h-2.5" />
                Clear Selection
              </button>
            )}
            {shapeMode === 'circle' && (
              <p className="font-mono text-[7px] text-muted-foreground/40 tracking-widest uppercase">SHIFT = perfect circle</p>
            )}
          </Section>
        )}

        {/* ── Background (overlay only) ── */}
        {settings.mode === 'overlay' && (
          <Section label={t('background')}>
            <ControlSlider label={t('bgBlur')} value={settings.bgBlur} min={0} max={12} onChange={(v) => onChange('bgBlur', v)} displayValue={`${settings.bgBlur}px`} />
            <ControlSlider label={t('bgDim')}  value={settings.bgDim}  min={0} max={80} onChange={(v) => onChange('bgDim', v)}  displayValue={`${settings.bgDim}%`} />
          </Section>
        )}

        {/* ── Effects ── */}
        <Section label={t('effects')}>
          <ControlSlider label={t('glow')}     value={settings.glowStrength}     min={0} max={100} onChange={(v) => onChange('glowStrength', v)} />
          <ControlSlider label={t('vignette')} value={settings.vignetteStrength} min={0} max={100} onChange={(v) => onChange('vignetteStrength', v)} />
        </Section>

        {/* ── Resolution ── */}
        <Section label={t('resolution')}>
          <ControlSlider
            label={t('columns')}
            value={settings.resolution}
            min={30} max={160}
            onChange={(v) => onChange('resolution', v)}
            displayValue={`${Math.round(settings.resolution)}`}
          />
        </Section>

      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border space-y-2 flex-shrink-0">
        <button
          onClick={handleDownload}
          disabled={!hasResult}
          className="w-full relative flex items-center justify-center gap-2 py-2.5 font-mono text-[10px] tracking-[0.25em] uppercase transition-all duration-200 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-25 disabled:cursor-not-allowed group overflow-hidden"
        >
          <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <Download className="w-3.5 h-3.5" />
          {t('exportPng')}
        </button>
        <button
          onClick={onResetEffects}
          className="w-full flex items-center justify-center gap-2 py-2 font-mono text-[9px] tracking-[0.25em] uppercase text-muted-foreground hover:text-amber-400 transition-colors duration-200 border border-transparent hover:border-border"
        >
          <Eraser className="w-3 h-3" />
          {t('resetEffects') || 'RESET EFFECTS'}
        </button>
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-2 font-mono text-[9px] tracking-[0.25em] uppercase text-muted-foreground hover:text-primary transition-colors duration-200 border border-transparent hover:border-border"
        >
          <RefreshCw className="w-3 h-3" />
          {t('newImage')}
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[8px] tracking-[0.35em] text-muted-foreground/60 uppercase whitespace-nowrap">{label}</span>
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
        className={`relative flex-shrink-0 w-8 h-4 transition-colors duration-200 ${value ? 'bg-primary' : 'bg-secondary border border-border'}`}
      >
        <span className={`absolute top-0.5 w-3 h-3 transition-all duration-200 ${value ? 'left-4 bg-primary-foreground' : 'left-0.5 bg-muted-foreground'}`} />
      </button>
    </div>
  );
}