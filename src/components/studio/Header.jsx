import React from 'react';
import { Languages } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

export default function Header() {
  const { lang, t, toggleLang } = useLang();

  return (
    <header className="relative z-20 flex-shrink-0 bg-background/85 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 sm:px-7 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-full bg-primary shadow-[0_0_34px_hsl(var(--primary)/0.18)] sm:h-9 sm:w-9">
            <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background" />
            <span className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-background" />
          </div>
          <div>
            <div className="font-mono text-sm font-bold uppercase tracking-[0.22em] text-foreground">
              ASCII<span className="text-primary">LENS</span>
            </div>
            <div className="font-mono text-[8px] uppercase tracking-[0.28em] text-foreground/55">
              {t('headerSubtitle')}
            </div>
          </div>
        </div>

        <button
          onClick={toggleLang}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-muted px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition-colors duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={t('languageToggle')}
          title={t('languageToggle')}
        >
          <Languages className="h-3 w-3" />
          {lang === 'en' ? '中文' : 'EN'}
        </button>
      </div>
    </header>
  );
}
