import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import AsciiParticleOrb from './AsciiParticleOrb';
import { useLang } from '@/lib/LanguageContext';

export default function UploadZone({ onUpload }) {
  const { t } = useLang();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    onUpload({ url, file });
  }, [onUpload]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const handleChange = useCallback((e) => {
    processFile(e.target.files[0]);
  }, [processFile]);

  const openFilePicker = useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 sm:gap-5">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto max-w-3xl space-y-2"
        >
          <div className="text-balance text-4xl font-semibold leading-[0.98] text-foreground sm:text-5xl lg:text-6xl">
            AsciiLens turns images into
            <span className="block font-serif font-normal italic text-primary">playful ASCII objects.</span>
          </div>
        </motion.div>

      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.18, duration: 0.75, ease: 'easeOut' }}
        className="w-full"
      >
        <AsciiParticleOrb />
      </motion.div>

      <input
        ref={fileInputRef}
        id="file-upload"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={handleChange}
      />

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        onClick={openFilePicker}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          group relative block w-full max-w-xl cursor-pointer overflow-hidden rounded-full
          border transition-all duration-300 upload-zone
          px-7 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-5
          ${dragging
            ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_48px_hsl(var(--primary)/0.18)]'
            : 'border-border/80 bg-muted hover:border-primary hover:bg-primary hover:text-primary-foreground'
          }
        `}
      >
        <div className="flex items-center justify-between gap-5 text-left">
          <motion.div
            animate={{ y: dragging ? -4 : 0 }}
            transition={{ duration: 0.2 }}
            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-200
              ${dragging ? 'border-background/20 bg-background/10' : 'border-border bg-background group-hover:border-background/25 group-hover:bg-background/10'}`}
          >
            <Upload className={`h-5 w-5 transition-colors ${dragging ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`} />
          </motion.div>

          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm uppercase tracking-[0.12em] leading-tight">
              {dragging ? t('dropDragging') : t('dropTitle')}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
              {t('dropSub')}
            </p>
          </div>
        </div>
      </motion.button>

    </div>
  );
}
