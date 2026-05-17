import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadZone from '../components/studio/UploadZone';
import AsciiCanvas from '../components/studio/AsciiCanvas';
import EditorPanel from '../components/studio/EditorPanel';
import Header from '../components/studio/Header';
import CanvasSelector from '../components/studio/CanvasSelector';
import { useLang } from '@/lib/LanguageContext';
import { fileAuditMetadata, trackAuditEvent } from '@/lib/audit';


const DEFAULT_SETTINGS = {
  mode: 'overlay',
  selectionShapes: [],
  customChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&',
  charSet: 'standard',
  colorMode: 'mono',
  monoColor: '#fffdfd',
  brightness: 50,
  contrast: 50,
  resolution: 80,
  invertLight: true,
  vignetteStrength: 30,
  glowStrength: 0,
  bgBlur: 0,
  bgDim: 20,
  imageFilterMode: 'original',
  imageFilterColor: '#fffdfd',
};

const SELECTION_SETTING_KEYS = new Set([
  'customChars',
  'charSet',
  'colorMode',
  'monoColor',
  'brightness',
  'contrast',
  'resolution',
  'invertLight',
  'glowStrength',
]);

function getSelectionStyleDefaults(settings) {
  return {
    customChars: settings.customChars,
    charSet: settings.charSet,
    colorMode: settings.colorMode,
    monoColor: settings.monoColor,
    brightness: settings.brightness,
    contrast: settings.contrast,
    resolution: settings.resolution,
    invertLight: settings.invertLight,
    glowStrength: settings.glowStrength,
  };
}

export default function Studio() {
  const { t } = useLang();
  const [image, setImage] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [asciiResult, setAsciiResult] = useState(null);
  const [shapeMode, setShapeMode] = useState('rect');
  const [activeSelectionId, setActiveSelectionId] = useState(null);
  const canvasRef = useRef(null);
  const replaceInputRef = useRef(null);

  useEffect(() => {
    trackAuditEvent('page_view');
  }, []);

  const handleImageUpload = useCallback((imgData, source = 'upload') => {
    setImage(current => {
      if (current?.url?.startsWith('blob:') && current.url !== imgData.url) URL.revokeObjectURL(current.url);
      return imgData;
    });
    setAsciiResult(null);
    setIsProcessing(false);
    setActiveSelectionId(null);
    setSettings({ ...DEFAULT_SETTINGS });
    trackAuditEvent('image_upload', {
      source,
      ...fileAuditMetadata(imgData.file),
    });
  }, []);

  const handleNewImage = useCallback(() => {
    if (!replaceInputRef.current) return;
    trackAuditEvent('new_image_picker_open');
    replaceInputRef.current.value = '';
    replaceInputRef.current.click();
  }, []);

  const handleReplaceImageChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    handleImageUpload({ url: URL.createObjectURL(file), file }, 'replace');
  }, [handleImageUpload]);

  const handleSettingsChange = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleEditorChange = useCallback((key, value) => {
    if (key === 'mode' && settings.mode !== value) {
      trackAuditEvent('render_mode_change', { mode: value });
    }

    if (settings.mode === 'overlay' && SELECTION_SETTING_KEYS.has(key) && activeSelectionId) {
      setSettings(prev => ({
        ...prev,
        selectionShapes: (prev.selectionShapes || []).map(shape => (
          shape.id === activeSelectionId
            ? { ...shape, settings: { ...(shape.settings || getSelectionStyleDefaults(prev)), [key]: value } }
            : shape
        )),
      }));
      return;
    }

    handleSettingsChange(key, value);
  }, [activeSelectionId, handleSettingsChange, settings.mode]);

  const handleAddSelection = useCallback((shape) => {
    const id = `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextShape = { ...shape, id, settings: getSelectionStyleDefaults(settings) };
    setSettings(prev => ({
      ...prev,
      selectionShapes: [...(prev.selectionShapes || []), nextShape],
    }));
    setActiveSelectionId(id);
    trackAuditEvent('selection_create', { shape_type: shape.type });
  }, [settings]);

  const handleUpdateSelection = useCallback((id, nextShape) => {
    setSettings(prev => ({
      ...prev,
      selectionShapes: (prev.selectionShapes || []).map(shape => (
        shape.id === id ? { ...shape, ...nextShape, id } : shape
      )),
    }));
  }, []);

  const handleDeleteSelection = useCallback((id) => {
    setSettings(prev => {
      const selectionShapes = (prev.selectionShapes || []).filter(shape => shape.id !== id);
      return { ...prev, selectionShapes };
    });
    setActiveSelectionId(current => (current === id ? null : current));
    trackAuditEvent('selection_delete');
  }, []);

  const hasImage = !!image;
  const selectionShapes = settings.selectionShapes || [];
  const activeSelection = selectionShapes.find(shape => shape.id === activeSelectionId);
  const activeStyleTarget = settings.mode === 'overlay' ? activeSelection : null;
  const editorSettings = useMemo(() => (
    activeStyleTarget?.settings
      ? { ...settings, ...activeSelection.settings }
      : settings
  ), [activeSelection?.settings, activeStyleTarget?.settings, settings]);
  const canvasSettings = useMemo(() => (
    { ...settings, activeSelectionId }
  ), [activeSelectionId, settings]);

  return (
    <div className={`relative flex min-h-screen flex-col bg-background ${
      hasImage ? 'overflow-hidden lg:h-screen' : 'overflow-x-hidden'
    }`}>
      <div className="acid-page-light pointer-events-none absolute inset-0" />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReplaceImageChange}
      />
      <Header />

      <main className="relative z-10 flex flex-1 flex-col lg:min-h-0 lg:flex-row">

        {/* Canvas area */}
        <div
          className={`relative flex flex-shrink-0 items-center justify-center p-4 lg:h-auto lg:flex-1 lg:p-8 ${
            hasImage
              ? 'h-[46vh] min-h-[320px] overflow-hidden lg:min-h-0'
              : 'min-h-[calc(100svh-68px)] overflow-visible py-4 sm:py-5'
          }`}
        >
          <div className="acid-ambient absolute inset-0" />

          {/* Background grid */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />

          <AnimatePresence mode="wait">
            {!hasImage ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="relative z-10 w-full"
              >
                <UploadZone onUpload={handleImageUpload} />
              </motion.div>
            ) : (
              <motion.div
                key="canvas"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 flex h-full min-h-0 w-full items-center justify-center"
              >
                {/* Canvas + overlay selector wrapper */}
                <div
                  className="acid-stage-shell relative flex h-full w-full items-center justify-center"
                  onPointerDown={() => {
                    if (settings.mode === 'overlay') setActiveSelectionId(null);
                  }}
                >
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 border-t border-l border-primary/50 z-10 pointer-events-none" style={{left:0,transform:'none'}} />
                  <span className="absolute top-0 right-0 w-5 h-5 border-t border-r border-primary/50 z-10 pointer-events-none" />
                  <span className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-primary/50 z-10 pointer-events-none" />
                  <span className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-primary/50 z-10 pointer-events-none" />

                  <AsciiCanvas
                    ref={canvasRef}
                    image={image}
                    settings={canvasSettings}
                    onProcessingChange={setIsProcessing}
                    onResult={setAsciiResult}
                  >
                    {/* Overlay selector — sits inside the canvas wrapper, exact same bounds */}
                    {settings.mode === 'overlay' && (
                      <CanvasSelector
                        selections={selectionShapes}
                        activeSelectionId={activeSelectionId}
                        onActiveSelectionChange={setActiveSelectionId}
                        onSelectionCreate={handleAddSelection}
                        onSelectionUpdate={handleUpdateSelection}
                        onSelectionDelete={handleDeleteSelection}
                        shapeMode={shapeMode}
                      />
                    )}
                  </AsciiCanvas>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom status bar */}
          {hasImage && (
            <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between font-mono text-[8px] tracking-widest text-muted-foreground/40 uppercase select-none">
              <span>ASCII·LENS</span>
              <span>
                COLS:{Math.round(settings.resolution)} · {settings.colorMode === 'original' ? 'ORIGINAL' : 'COLOR'} · {settings.mode.toUpperCase()}
              </span>
              <span>{t('ready')}</span>
            </div>
          )}
        </div>

        {/* Editor Panel */}
        <AnimatePresence>
          {hasImage && (
            <motion.aside
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex w-full flex-shrink-0 flex-col border-t border-border/80 bg-card/[0.9] shadow-[0_0_60px_hsl(var(--background)/0.55)] backdrop-blur-xl lg:min-h-0 lg:w-[280px] lg:border-l lg:border-t-0 xl:w-[300px]"
            >
              <EditorPanel
                settings={editorSettings}
                renderMode={settings.mode}
                onChange={handleEditorChange}
                onReset={handleNewImage}
                onResetEffects={() => {
                  setActiveSelectionId(null);
                  setAsciiResult(null);
                  setSettings({ ...DEFAULT_SETTINGS });
                  trackAuditEvent('reset_effects');
                }}
                canvasRef={canvasRef}
                isProcessing={isProcessing}
                hasResult={!!asciiResult}
                shapeMode={shapeMode}
                onShapeModeChange={(nextMode) => {
                  setShapeMode(nextMode);
                  trackAuditEvent('selection_tool_change', { shape_mode: nextMode });
                }}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
