import { useCallback, useEffect, useRef, useState } from 'react';
import {
  usePadSettingsStore,
  type PadSettings,
  type PresetFile,
  type LoopMode,
} from '../store/padSettingsStore';
import type { Sample } from '../utils/audioSlicer';

interface PadSettingsProps {
  padId: string;
  padLabel: string;
  sample?: Sample;
  /** Every pad id across all banks — used for "copy to all pads". */
  allPadIds?: string[];
  onClose: () => void;
}

export function PadSettings({ padId, padLabel, sample, allPadIds, onClose }: PadSettingsProps) {
  const { getSettings, updateSettings, resetSettings, applyToAll, exportPreset, importPreset } =
    usePadSettingsStore();
  const [copied, setCopied] = useState(false);

  const s       = getSettings(padId);
  const set     = useCallback((p: Partial<PadSettings>) => updateSettings(padId, p), [padId, updateSettings]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleApplyToAll = useCallback(() => {
    if (!allPadIds || allPadIds.length === 0) return;
    applyToAll(padId, allPadIds);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [allPadIds, applyToAll, padId]);

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

      {/* ── Trim ── */}
      <TrimBar
        startRatio={s.startRatio}
        endRatio={s.endRatio}
        durationMs={sample?.durationMs}
        audioBuffer={sample?.audioBuffer}
        onChange={(startRatio, endRatio) => set({ startRatio, endRatio })}
      />

      {/* ── Loop mode ── */}
      <LoopModeRow
        loopMode={s.loopMode}
        onChange={(loopMode) => set({ loopMode })}
      />

      <div className="ps-preset-row">
        <button
          className="ps-preset-btn ps-preset-btn--accent"
          onClick={handleApplyToAll}
          disabled={!allPadIds || allPadIds.length <= 1}
          title="Apply this pad's pitch, speed, ADSR, trim and loop settings to every pad"
        >
          {copied ? '✓ Copied' : '⇉ Copy to All'}
        </button>
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

// ── TrimBar ───────────────────────────────────────────────────────────────────

/** Draws a min/max amplitude waveform of the buffer onto a canvas. */
function WaveformCanvas({ audioBuffer }: { audioBuffer?: AudioBuffer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const mid  = height / 2;

    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#7c8cff';
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.55;

    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      const start = x * step;
      const end   = Math.min(start + step, data.length);
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min > max) { min = 0; max = 0; }
      const y1 = mid + min * mid;
      const y2 = mid + max * mid;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }, [audioBuffer]);

  return <canvas ref={canvasRef} className="ps-trim-waveform" width={300} height={28} />;
}

function TrimBar({ startRatio, endRatio, durationMs, audioBuffer, onChange }: {
  startRatio: number; endRatio: number; durationMs?: number; audioBuffer?: AudioBuffer;
  onChange: (start: number, end: number) => void;
}) {
  const dur = (durationMs ?? 0) / 1000;
  return (
    <div className="ps-section">
      <div className="ps-section-label">
        <span>Trim</span>
        <span className="ps-trim-range">
          {fmtSec(startRatio * dur)} → {fmtSec(endRatio * dur)}
          {dur > 0 && <span className="ps-trim-pct"> ({Math.round((endRatio - startRatio) * 100)}%)</span>}
        </span>
      </div>
      <div className="ps-trim-bar">
        <WaveformCanvas audioBuffer={audioBuffer} />
        <div
          className="ps-trim-region"
          style={{ left: `${startRatio * 100}%`, width: `${(endRatio - startRatio) * 100}%` }}
        />
        <input type="range" className="ps-trim-range-input ps-trim-start"
          min={0} max={1} step={0.001} value={startRatio}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(v, endRatio - 0.001), endRatio);
          }} />
        <input type="range" className="ps-trim-range-input ps-trim-end"
          min={0} max={1} step={0.001} value={endRatio}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(startRatio, Math.max(v, startRatio + 0.001));
          }} />
      </div>
    </div>
  );
}

// ── LoopModeRow ───────────────────────────────────────────────────────────────

const LOOP_MODES: { value: LoopMode; label: string; title: string }[] = [
  { value: 'off',       label: '—', title: 'No loop'      },
  { value: 'forward',   label: '→', title: 'Forward loop'  },
  { value: 'reverse',   label: '←', title: 'Reverse loop'  },
  { value: 'ping-pong', label: '↔', title: 'Ping-pong loop' },
];

function LoopModeRow({ loopMode, onChange }: { loopMode: LoopMode; onChange: (m: LoopMode) => void }) {
  return (
    <div className="ps-section">
      <div className="ps-section-label"><span>Loop</span></div>
      <div className="ps-loop-row">
        {LOOP_MODES.map(({ value, label, title }) => (
          <button key={value}
            className={`ps-loop-btn ${loopMode === value ? 'ps-loop-btn--active' : ''}`}
            title={title} onClick={() => onChange(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
