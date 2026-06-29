import React from 'react';

export default function ControlSlider({ label, value, min, max, onChange, displayValue = value }) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="group space-y-1">
      <div className="flex justify-between items-center">
        <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase group-hover:text-foreground/70 transition-colors">
          {label}
        </label>
        <span className="font-mono text-[10px] text-primary tabular-nums">
          {displayValue}
        </span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mobile-range w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--border)) ${pct}%)`,
        }}
      />
    </div>
  );
}
