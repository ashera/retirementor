"use client";

interface FieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  hint?: string;
}

export default function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  hint,
}: FieldProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-slate-200">{label}</label>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 px-2 py-1">
          {prefix && <span className="text-xs text-muted">{prefix}</span>}
          <input
            type="number"
            value={Number.isNaN(value) ? "" : value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
            className="w-24 bg-transparent text-right text-sm font-semibold tabular-nums text-white outline-none"
          />
          {suffix && <span className="text-xs text-muted">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        value={Number.isNaN(value) ? min : value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
