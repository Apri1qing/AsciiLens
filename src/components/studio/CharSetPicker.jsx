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
              className={`py-2 px-1 text-center transition-all duration-150
                ${active
                  ? 'bg-primary/10 ring-1 ring-primary text-primary'
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
            className="w-full bg-secondary border border-border rounded-none px-3 py-2 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 resize-none h-14 focus:outline-none focus:border-primary/50 transition-colors"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}