import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UploadZone from '../components/studio/UploadZone';
import AsciiCanvas from '../components/studio/AsciiCanvas';
import EditorPanel from '../components/studio/EditorPanel';
import Header from '../components/studio/Header';
import CanvasSelector from '../components/studio/CanvasSelector';
import { useLang } from '@/lib/LanguageContext';


const DEFAULT_SETTINGS = {
  mode: 'overlay',
  selectionRect: null,
  customChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&',
  charSet: 'standard',
  colorMode: 'original',
  brightness: 50,
  contrast: 50,
  resolution: 80,
  invertLight: true,
  vignetteStrength: 30,
  glowStrength: 0,
  bgBlur: 0,
  bgDim: 20,
};

export default function Studio() {
  const { t } = useLang();
  const [image, setImage] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [asciiResult, setAsciiResult] = useState(null);
  const [shapeMode, setShapeMode] = useState('rect');
  const canvasRef = useRef(null);

  const handleImageUpload = useCallback((imgData) => {
    setImage(imgData);
    setAsciiResult(null);
    setSettings(s => ({ ...s, selectionRect: null }));
  }, []);

  const handleSettingsChange = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const hasImage = !!image;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />

      <main className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-8 relative min-h-0 overflow-hidden">
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
                className="w-full relative z-10"
              >
                <UploadZone onUpload={handleImageUpload} />
              </motion.div>
            ) : (
              <motion.div
                key="canvas"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full h-full flex items-center justify-center relative z-10 min-h-0"
              >
                {/* Canvas + overlay selector wrapper */}
                <div className="relative flex items-center justify-center w-full h-full">
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 border-t border-l border-primary/50 z-10 pointer-events-none" style={{left:0,transform:'none'}} />
                  <span className="absolute top-0 right-0 w-5 h-5 border-t border-r border-primary/50 z-10 pointer-events-none" />
                  <span className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-primary/50 z-10 pointer-events-none" />
                  <span className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-primary/50 z-10 pointer-events-none" />

                  <AsciiCanvas
                    ref={canvasRef}
                    image={image}
                    settings={settings}
                    onProcessingChange={setIsProcessing}
                    onResult={setAsciiResult}
                  >
                    {/* Overlay selector — sits inside the canvas wrapper, exact same bounds */}
                    {settings.mode === 'overlay' && (
                      <CanvasSelector
                        selectionRect={settings.selectionRect}
                        onSelectionChange={(rect) => handleSettingsChange('selectionRect', rect)}
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
                COLS:{Math.round(settings.resolution)} · {settings.colorMode.toUpperCase()} · {settings.mode.toUpperCase()}
                {settings.mode === 'overlay' && settings.selectionRect ? ' · MANUAL' : ''}
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
              className="w-full lg:w-[280px] xl:w-[300px] border-t lg:border-t-0 lg:border-l border-border bg-card flex-shrink-0 flex flex-col min-h-0"
            >
              <EditorPanel
                settings={settings}
                onChange={handleSettingsChange}
                onReset={() => setImage(null)}
                onResetEffects={() => setSettings({ ...DEFAULT_SETTINGS })}
                canvasRef={canvasRef}
                isProcessing={isProcessing}
                hasResult={!!asciiResult}
                shapeMode={shapeMode}
                onShapeModeChange={(m) => { setShapeMode(m); handleSettingsChange('selectionRect', null); }}
                onClearSelection={() => handleSettingsChange('selectionRect', null)}
                hasSelection={!!settings.selectionRect}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}