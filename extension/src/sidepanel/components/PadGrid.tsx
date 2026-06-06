import { useMemo, useCallback, useEffect, useState } from 'react';
import { PadSettings } from './PadSettings';
import { usePadStore } from '../store/padStore';
import { usePadPlayer } from '../hooks/usePadPlayer';
import { usePadSettingsStore, DEFAULT_SETTINGS } from '../store/padSettingsStore';
import type { Sample } from '../utils/audioSlicer';

const KEY_LABELS = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'];
const BANK_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const KEY_MAP: Record<string, number> = {
  q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8,
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8,
};

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

interface PadItem { id: string; number: number; sample: Sample | null; keyLabel: string; }

interface PadGridProps { samples: Sample[]; onNewRecording: () => void; }

export function PadGrid({ samples, onNewRecording }: PadGridProps) {
  const { currentBank, playingPads, setCurrentBank } = usePadStore();
  const { triggerSample, stopAll, isCapturing, startCapture, stopCapture } = usePadPlayer();
  const { getSettings } = usePadSettingsStore();
  const [selectedPad, setSelectedPad] = useState<PadItem | null>(null);

  const banks = useMemo<Sample[][]>(() => {
    if (!samples.length) return [[]];
    const r: Sample[][] = [];
    for (let i = 0; i < samples.length; i += 9) r.push(samples.slice(i, i + 9));
    return r;
  }, [samples]);

  const safeBank = Math.min(currentBank, banks.length - 1);
  useEffect(() => setSelectedPad(null), [safeBank]);

  const pads = useMemo<PadItem[]>(() => {
    const bs = banks[safeBank] ?? [];
    return Array.from({ length: 9 }, (_, i) => ({
      id: `bank${safeBank}-pad${i}`, number: i + 1,
      sample: bs[i] ?? null, keyLabel: KEY_LABELS[i],
    }));
  }, [banks, safeBank]);

  const handleTrigger = useCallback((pad: PadItem) => {
    if (pad.sample) triggerSample(pad.id, pad.sample);
  }, [triggerSample]);

  const handleGear = useCallback((pad: PadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPad((p) => p?.id === pad.id ? null : pad);
  }, []);

  const handleBankChange = useCallback((b: number) => {
    stopAll(); setCurrentBank(b); setSelectedPad(null);
  }, [stopAll, setCurrentBank]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const el  = e.target as HTMLElement;
      const tag = el.tagName;
      const isTextInput = tag === 'TEXTAREA' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range');
      if (isTextInput || e.repeat) return;
      const idx = KEY_MAP[e.key.toLowerCase()];
      if (idx === undefined) return;
      const pad = pads[idx];
      if (pad?.sample) { e.preventDefault(); triggerSample(pad.id, pad.sample); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [pads, triggerSample]);

  return (
    <div className="pad-grid-section">
      {/* ── Toolbar ── */}
      <div className="pg-toolbar">
        <div className="pg-bank-info">
          <span className="pg-bank-label">BANK</span>
          <span className="pg-bank-name">{BANK_NAMES[safeBank] ?? safeBank + 1}</span>
          <span className="pg-sample-count">{banks[safeBank]?.length ?? 0}/9</span>
        </div>
        <div className="pg-bank-nav">
          <button className="pg-nav-btn" onClick={() => handleBankChange(safeBank - 1)} disabled={safeBank === 0}>‹</button>
          {banks.map((_, i) => (
            <button key={i} className={`pg-bank-dot ${i === safeBank ? 'pg-bank-dot--active' : ''}`}
              onClick={() => handleBankChange(i)} />
          ))}
          <button className="pg-nav-btn" onClick={() => handleBankChange(safeBank + 1)} disabled={safeBank === banks.length - 1}>›</button>
        </div>

        <button
          className={`pg-rec-btn ${isCapturing ? 'pg-rec-btn--active' : ''}`}
          onClick={isCapturing ? stopCapture : startCapture}
          title={isCapturing ? 'Stop recording and save' : 'Record performance'}
          aria-label={isCapturing ? 'Stop recording' : 'Record performance'}
        >
          <span className="pg-rec-dot" aria-hidden />
          {isCapturing ? 'Stop' : 'Rec'}
        </button>

        <button className="btn btn--reset btn--sm" onClick={onNewRecording} title="New recording">↺</button>
      </div>

      {/* ── 3×3 Grid ── */}
      <div className="pad-grid">
        {pads.map((pad) => {
          const playing  = playingPads.has(pad.id);
          const selected = selectedPad?.id === pad.id;
          const s        = getSettings(pad.id);
          const custom   = pad.sample && (
            s.pitch   !== DEFAULT_SETTINGS.pitch   || s.speed   !== DEFAULT_SETTINGS.speed   ||
            s.attack  !== DEFAULT_SETTINGS.attack  || s.decay   !== DEFAULT_SETTINGS.decay   ||
            s.sustain !== DEFAULT_SETTINGS.sustain || s.release !== DEFAULT_SETTINGS.release
          );

          return (
            <button key={pad.id}
              className={['pad', pad.sample ? 'pad--filled' : 'pad--empty',
                playing ? 'pad--playing' : '', selected ? 'pad--selected' : ''].join(' ')}
              onClick={() => handleTrigger(pad)}
              disabled={!pad.sample}
            >
              <span className="pad-key">{pad.keyLabel}</span>

              {/* gear — span not button to avoid invalid nested button */}
              {pad.sample && (
                <span
                  role="button"
                  tabIndex={0}
                  className={`pad-gear ${custom ? 'pad-gear--active' : ''}`}
                  onClick={(e) => handleGear(pad, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPad((p) => p?.id === pad.id ? null : pad); }
                  }}
                  aria-label={`Edit ${pad.sample.label} settings`}
                  title="Edit pad settings"
                >⚙</span>
              )}

              {pad.sample ? (
                <>
                  <span className="pad-sample-name">{pad.sample.label}</span>
                  <span className="pad-duration">{fmtMs(pad.sample.durationMs)}</span>
                </>
              ) : <span className="pad-empty-label">—</span>}

              {playing && <span className="pad-ring" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* ── Settings Panel ── */}
      {selectedPad ? (
        <PadSettings
          padId={selectedPad.id}
          padLabel={selectedPad.sample?.label ?? `Pad ${selectedPad.number}`}
          onClose={() => setSelectedPad(null)}
        />
      ) : (
        <p className="pg-legend-text">Q W E · A S D · Z X C · ⚙ to edit</p>
      )}
    </div>
  );
}
