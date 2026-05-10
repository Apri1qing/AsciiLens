import React from 'react';

const PRESETS = [
  { id: 'standard', label: 'Classic', preview: '@#%+:.' },
  { id: 'blocks',   label: 'Block',   preview: '█▓▒░ ' },
  { id: 'dots',     label: 'Dots',    preview: '●◉○·' },
  { id: 'custom',   label: 'Custom',  preview: 'A–Z' },
];

export default function CharSetPicker({ charSet, customChars, onCharSetChange, onCustomCharsChange }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1">
        {PRESETS.map((p) => {
          const active = charSet === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onCharSetChange(p.id)}
              className={`rounded-[4px] px-1 py-2 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
                ${active
                  ? 'bg-primary text-primary-foreground ring-1 ring-primary'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }`}
            >
              <div className="font-mono text-[8px] tracking-tight leading-none mb-1">{p.preview}</div>
              <div className="font-mono text-[7px] tracking-[0.2em] uppercase">{p.label}</div>
            </button>
          );
        })}
      </div>

      {charSet === 'custom' && (
        <div className="space-y-1.5">
          <p className="font-mono text-[8px] tracking-widest text-muted-foreground uppercase">Dense → Light</p>
          <textarea
            value={customChars}
            onChange={(e) => onCustomCharsChange(e.target.value)}
            placeholder="e.g. HELLO WORLD @#$..."
            className="h-14 w-full resize-none rounded-[6px] border border-border bg-background px-3 py-2 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/55 transition-colors focus:border-primary/70 focus:outline-none focus:ring-1 focus:ring-primary/30"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
