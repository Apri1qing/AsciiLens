import React from 'react';
import { useLang } from '@/lib/LanguageContext';

export default function Header() {
  const { lang, toggleLang } = useLang();

  return (
    <header className="flex-shrink-0 relative">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-bold tracking-[0.25em] text-foreground uppercase">
            ACID
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.25em] text-primary uppercase">
            LENS
          </span>
        </div>

        {/* Language toggle only */}
        <button
          onClick={toggleLang}
          className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors duration-200 uppercase"
        >
          {lang === 'en' ? '中文' : 'EN'}
        </button>
      </div>
    </header>
  );
}