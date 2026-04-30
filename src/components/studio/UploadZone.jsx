import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

export default function UploadZone({ onUpload }) {
  const { t } = useLang();
  const [dragging, setDragging] = useState(false);

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

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-12">

      {/* Hero title */}
      <div className="text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="font-mono text-[9px] sm:text-[10px] leading-tight text-primary/30 select-none mb-4 overflow-hidden">
            {`█████╗ ███████╗ ██████╗██╗██╗
██╔══██╗██╔════╝██╔════╝██║██║
███████║███████╗██║     ██║██║
██╔══██║╚════██║██║     ██║██║
██║  ██║███████║╚██████╗██║██║
╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝╚═╝`}
          </div>
          <div className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.15em] text-foreground">
            ASCII<span className="text-primary">LENS</span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="font-mono text-[10px] tracking-[0.4em] text-muted-foreground uppercase"
        >
          {t('heroSub')}
        </motion.p>
      </div>

      {/* Drop zone */}
      <motion.label
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        htmlFor="file-upload"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          relative block cursor-pointer w-full
          border border-dashed rounded-none p-12 sm:p-16
          transition-all duration-300 group upload-zone
          ${dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/40 hover:bg-muted/20'
          }
        `}
      >
        <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={handleChange} />

        {/* Corner brackets */}
        <span className="absolute top-0 left-0 w-4 h-4 border-t border-l border-primary/60" />
        <span className="absolute top-0 right-0 w-4 h-4 border-t border-r border-primary/60" />
        <span className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-primary/60" />
        <span className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-primary/60" />

        <div className="flex flex-col items-center gap-5 text-center">
          <motion.div
            animate={{ y: dragging ? -4 : 0 }}
            transition={{ duration: 0.2 }}
            className={`w-12 h-12 flex items-center justify-center border transition-colors duration-200
              ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50 group-hover:border-primary/40'}`}
          >
            <Upload className={`w-5 h-5 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground/70'}`} />
          </motion.div>

          <div>
            <p className="font-mono text-sm tracking-wider text-foreground/80 uppercase">
              {dragging ? t('dropDragging') : t('dropTitle')}
            </p>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground mt-2 uppercase">
              {t('dropSub')}
            </p>
          </div>
        </div>
      </motion.label>

      {/* Decorative bottom row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="w-full flex items-center gap-4 text-[9px] font-mono text-muted-foreground/30 tracking-widest uppercase select-none"
      >
        <div className="flex-1 h-px bg-border" />
        <span>{t('featFull')}</span>
        <span className="text-primary/30">◆</span>
        <span>{t('featOverlay')}</span>
        <span className="text-primary/30">◆</span>
        <span>{t('featExport')}</span>
        <div className="flex-1 h-px bg-border" />
      </motion.div>
    </div>
  );
}