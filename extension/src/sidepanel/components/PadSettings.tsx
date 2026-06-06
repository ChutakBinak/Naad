import { useCallback, useRef } from 'react';
import {
  usePadSettingsStore,
  type PadSettings,
  type PresetFile,
} from '../store/padSettingsStore';

interface PadSettingsProps {
  padId: string;
  padLabel: string;
  onClose: () => void;
}

export function PadSettings({ padId, padLabel, onClose }: PadSettingsProps) {
  const { getSettings, updateSettings, resetSettings, exportPreset, importPreset } =
    usePadSettingsStore();

  const s       = getSettings(padId);
  const set     = useCallback((p: Partial<PadSettings>) => updateSettings(padId, p), [padId, updateSettings]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = exportPreset();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `naad-preset-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result as string) as PresetFile;
        if (p.version === '1' && p.pads) importPreset(p);
      } catch { /* */ }
    };
    r.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="pad-settings">
      <div className="ps-header">
        <span className="ps-title">{padLabel}</span>
        <div className="ps-header-actions">
          <button className="ps-icon-btn" onClick={() => resetSettings(padId)}>↺</button>
          <button className="ps-icon-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="ps-grid">
        <Slider label="Pitch" value={s.pitch} min={-24} max={24} step={1}
          format={(v) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v}`)}
          onChange={(v) => set({ pitch: v })} />

        <Slider label="Speed" value={s.speed} min={0.25} max={4} step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => set({ speed: v })} />

        <Slider label="Attack" value={s.attack} min={0.001} max={2} step={0.001}
          format={fmtSec} onChange={(v) => set({ attack: v })} />

        <Slider label="Decay" value={s.decay} min={0.001} max={2} step={0.001}
          format={fmtSec} onChange={(v) => set({ decay: v })} />

        <Slider label="Sustain" value={s.sustain} min={0} max={1} step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ sustain: v })} />

        <Slider label="Release" value={s.release} min={0.001} max={4} step={0.001}
          format={fmtSec} onChange={(v) => set({ release: v })} />
      </div>

      <div className="ps-preset-row">
        <button className="ps-preset-btn" onClick={handleExport}>↓ Preset</button>
        <button className="ps-preset-btn" onClick={() => fileRef.current?.click()}>↑ Load</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="ps-slider">
      <div className="ps-slider-header">
        <span className="ps-slider-label">{label}</span>
        <span className="ps-slider-value">{format(value)}</span>
      </div>
      <div className="ps-track-wrap">
        <div className="ps-track-fill" style={{ width: `${pct}%` }} />
        <input type="range" className="ps-range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}

function fmtSec(v: number) { return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`; }
