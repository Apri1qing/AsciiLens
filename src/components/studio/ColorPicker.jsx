import React from 'react';

const COLORS = [
  { id: 'white',    label: 'Film',     swatch: '#e8e6d8', desc: 'Classic' },
  { id: 'gold',     label: 'Gold',     swatch: 'hsl(43,95%,58%)', desc: 'Cinematic' },
  { id: 'green',    label: 'Matrix',   swatch: 'hsl(120,80%,45%)', desc: 'Hacker' },
  { id: 'neon',     label: 'Neon',     swatch: 'hsl(200,100%,55%)', desc: 'Cyber' },
  { id: 'cyan',     label: 'Ice',      swatch: 'hsl(185,100%,50%)', desc: 'Cryo' },
  { id: 'original', label: 'Color',    swatch: 'linear-gradient(135deg,#f55,#5f5,#55f)', desc: 'RGB' },
];

export default function ColorPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {COLORS.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`relative flex flex-col overflow-hidden transition-all duration-150
              ${active
                ? 'ring-1 ring-primary ring-offset-0'
                : 'hover:ring-1 hover:ring-border'
              }`}
          >
            {/* Swatch */}
            <div className="h-5 w-full" style={{ background: c.swatch }} />
            {/* Label */}
            <div className={`px-1.5 py-1 text-left transition-colors ${active ? 'bg-primary/10' : 'bg-muted'}`}>
              <div className="font-mono text-[8px] tracking-widest uppercase text-foreground/80 leading-tight">{c.label}</div>
              <div className="font-mono text-[7px] text-muted-foreground/70">{c.desc}</div>
            </div>
            {/* Active dot */}
            {active && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_4px_hsl(var(--primary))]" />
            )}
          </button>
        );
      })}
    </div>
  );
}