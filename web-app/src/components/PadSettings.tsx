import { useCallback, useRef } from 'react';
import {
  usePadSettingsStore,
  type PadSettings,
  type PresetFile,
  type LoopMode,
} from '../store/padSettingsStore';
import type { Sample } from '../types';

interface PadSettingsProps {
  padId: string;
  padLabel: string;
  sample?: Sample;
  onClose: () => void;
}

export function PadSettings({ padId, padLabel, sample, onClose }: PadSettingsProps) {
  const { getSettings, updateSettings, resetSettings, exportPreset, importPreset } =
    usePadSettingsStore();

  const settings = getSettings(padId);
  const fileRef  = useRef<HTMLInputElement>(null);

  const set = useCallback(
    (patch: Partial<PadSettings>) => updateSettings(padId, patch),
    [padId, updateSettings],
  );

  // ── Preset export ─────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const blob = exportPreset();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `naad-preset-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, [exportPreset]);

  // ── Preset import ─────────────────────────────────────────────────────────
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const preset = JSON.parse(reader.result as string) as PresetFile;
          if (preset.version === '1' && preset.pads) {
            importPreset(preset);
          }
        } catch {
          /* ignore malformed file */
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [importPreset],
  );

  return (
    <div className="pad-settings">
      {/* Header */}
      <div className="ps-header">
        <div className="ps-title-row">
          <span className="ps-title">{padLabel}</span>
          <span className="ps-subtitle">SETTINGS</span>
        </div>
        <div className="ps-header-actions">
          <button className="ps-icon-btn" onClick={() => resetSettings(padId)} title="Reset to defaults">
            ↺
          </button>
          <button className="ps-icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {/* Controls grid */}
      <div className="ps-grid">
        {/* ── Pitch ── */}
        <Slider
          label="Pitch"
          value={settings.pitch}
          min={-24}
          max={24}
          step={1}
          format={(v) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`)}
          onChange={(v) => set({ pitch: v })}
          accent
        />

        {/* ── Speed ── */}
        <Slider
          label="Speed"
          value={settings.speed}
          min={0.25}
          max={4}
          step={0.05}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => set({ speed: v })}
          accent
        />

        {/* ── ADSR ── */}
        <Slider
          label="Attack"
          value={settings.attack}
          min={0.001}
          max={2}
          step={0.001}
          format={fmtSec}
          onChange={(v) => set({ attack: v })}
        />
        <Slider
          label="Decay"
          value={settings.decay}
          min={0.001}
          max={2}
          step={0.001}
          format={fmtSec}
          onChange={(v) => set({ decay: v })}
        />
        <Slider
          label="Sustain"
          value={settings.sustain}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ sustain: v })}
        />
        <Slider
          label="Release"
          value={settings.release}
          min={0.001}
          max={4}
          step={0.001}
          format={fmtSec}
          onChange={(v) => set({ release: v })}
        />
      </div>

      {/* ADSR visualiser */}
      <ADSRViz settings={settings} />

      {/* ── Trim ── */}
      <TrimBar
        startRatio={settings.startRatio}
        endRatio={settings.endRatio}
        durationMs={sample?.durationMs}
        onChange={(startRatio, endRatio) => set({ startRatio, endRatio })}
      />

      {/* ── Loop mode ── */}
      <LoopModeRow
        loopMode={settings.loopMode}
        onChange={(loopMode) => set({ loopMode })}
      />

      {/* Preset actions */}
      <div className="ps-preset-row">
        <button className="ps-preset-btn" onClick={handleExport}>
          ↓ Save Preset
        </button>
        <button className="ps-preset-btn" onClick={() => fileRef.current?.click()}>
          ↑ Load Preset
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </div>
    </div>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  accent?: boolean;
}

function Slider({ label, value, min, max, step, format, onChange, accent }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={`ps-slider ${accent ? 'ps-slider--accent' : ''}`}>
      <div className="ps-slider-header">
        <span className="ps-slider-label">{label}</span>
        <span className="ps-slider-value">{format(value)}</span>
      </div>
      <div className="ps-track-wrap">
        <div className="ps-track-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="ps-range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

// ── ADSR Visualiser ───────────────────────────────────────────────────────────

function ADSRViz({ settings }: { settings: PadSettings }) {
  const W = 220;
  const H = 52;
  const PAD = 4;

  const { attack, decay, sustain, release } = settings;
  const total = attack + decay + 0.3 + release; // 0.3 = sustain hold segment

  const x = (t: number) => PAD + ((t / total) * (W - PAD * 2));
  const y = (level: number) => PAD + (1 - level) * (H - PAD * 2);

  const points = [
    [PAD,                        y(0)],
    [x(attack),                  y(1)],
    [x(attack + decay),          y(sustain)],
    [x(attack + decay + 0.3),    y(sustain)],
    [x(attack + decay + 0.3 + release), y(0)],
  ] as [number, number][];

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  return (
    <div className="ps-adsr-viz">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label="ADSR envelope">
        {/* Grid line at sustain level */}
        <line
          x1={PAD} y1={y(sustain)}
          x2={W - PAD} y2={y(sustain)}
          stroke="var(--border)" strokeDasharray="3,3"
        />
        {/* Envelope path */}
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Points */}
        {points.slice(1, -1).map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={2.5} fill="var(--accent)" />
        ))}
        {/* Labels */}
        {[
          [x(attack / 2),                   H - 2, 'A'],
          [x(attack + decay / 2),            H - 2, 'D'],
          [x(attack + decay + 0.15),         H - 2, 'S'],
          [x(attack + decay + 0.3 + release / 2), H - 2, 'R'],
        ].map(([lx, ly, lt]) => (
          <text key={lt as string} x={lx as number} y={ly as number} textAnchor="middle"
            fontSize="8" fill="var(--text-2)" fontFamily="monospace">
            {lt}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── TrimBar ───────────────────────────────────────────────────────────────────

interface TrimBarProps {
  startRatio: number;
  endRatio:   number;
  durationMs?: number;
  onChange:   (start: number, end: number) => void;
}

function TrimBar({ startRatio, endRatio, durationMs, onChange }: TrimBarProps) {
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
        {/* Highlighted region */}
        <div
          className="ps-trim-region"
          style={{ left: `${startRatio * 100}%`, width: `${(endRatio - startRatio) * 100}%` }}
        />
        {/* Start handle */}
        <input
          type="range"
          className="ps-trim-range-input ps-trim-start"
          min={0} max={1} step={0.001}
          value={startRatio}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.min(v, endRatio - 0.001), endRatio);
          }}
        />
        {/* End handle */}
        <input
          type="range"
          className="ps-trim-range-input ps-trim-end"
          min={0} max={1} step={0.001}
          value={endRatio}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(startRatio, Math.max(v, startRatio + 0.001));
          }}
        />
      </div>
    </div>
  );
}

// ── LoopModeRow ───────────────────────────────────────────────────────────────

const LOOP_MODES: { value: LoopMode; label: string; title: string }[] = [
  { value: 'off',       label: '—',  title: 'No loop'     },
  { value: 'forward',   label: '→',  title: 'Forward loop' },
  { value: 'reverse',   label: '←',  title: 'Reverse loop' },
  { value: 'ping-pong', label: '↔',  title: 'Ping-pong loop' },
];

function LoopModeRow({ loopMode, onChange }: { loopMode: LoopMode; onChange: (m: LoopMode) => void }) {
  return (
    <div className="ps-section">
      <div className="ps-section-label"><span>Loop</span></div>
      <div className="ps-loop-row">
        {LOOP_MODES.map(({ value, label, title }) => (
          <button
            key={value}
            className={`ps-loop-btn ${loopMode === value ? 'ps-loop-btn--active' : ''}`}
            title={title}
            onClick={() => onChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSec(v: number): string {
  return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`;
}
