import { useMemo, useCallback, useEffect, useState } from 'react';
import { Pad, type PadData } from './Pad';
import { PadSettings } from './PadSettings';
import { usePadStore } from '../store/padStore';
import { usePadPlayer } from '../hooks/usePadPlayer';
import type { Sample } from '../types';

const KEY_LABELS = ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'];
const BANK_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const KEY_MAP: Record<string, number> = {
  q: 0, w: 1, e: 2,
  a: 3, s: 4, d: 5,
  z: 6, x: 7, c: 8,
  '1': 0, '2': 1, '3': 2,
  '4': 3, '5': 4, '6': 5,
  '7': 6, '8': 7, '9': 8,
};

interface PadGridProps {
  samples: Sample[];
}

export function PadGrid({ samples }: PadGridProps) {
  const { currentBank, playingPads, setCurrentBank } = usePadStore();
  const { triggerSample, stopAll, isCapturing, startCapture, stopCapture } = usePadPlayer();

  const [selectedPad, setSelectedPad] = useState<PadData | null>(null);

  // ── Banks ─────────────────────────────────────────────────────────────────
  const banks = useMemo<Sample[][]>(() => {
    if (samples.length === 0) return [[]];
    const r: Sample[][] = [];
    for (let i = 0; i < samples.length; i += 9) r.push(samples.slice(i, i + 9));
    return r;
  }, [samples]);

  const safeBank = Math.min(currentBank, banks.length - 1);

  const pads = useMemo<PadData[]>(() => {
    const bs = banks[safeBank] ?? [];
    return Array.from({ length: 9 }, (_, i) => ({
      id:       `bank${safeBank}-pad${i}`,
      number:   i + 1,
      sample:   bs[i] ?? null,
      keyLabel: KEY_LABELS[i],
    }));
  }, [banks, safeBank]);

  // Every pad id across every bank — used for "copy to all pads".
  const allPadIds = useMemo<string[]>(
    () => banks.flatMap((_, bi) => Array.from({ length: 9 }, (_, i) => `bank${bi}-pad${i}`)),
    [banks],
  );

  // Deselect pad when bank changes
  useEffect(() => { setSelectedPad(null); }, [safeBank]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTrigger = useCallback((pad: PadData) => {
    if (pad.sample) triggerSample(pad.id, pad.sample);
  }, [triggerSample]);

  const handleEdit = useCallback((pad: PadData) => {
    setSelectedPad((prev) => prev?.id === pad.id ? null : pad);
  }, []);

  const handleBankChange = useCallback((b: number) => {
    stopAll(); setCurrentBank(b); setSelectedPad(null);
  }, [stopAll, setCurrentBank]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el  = e.target as HTMLElement;
      const tag = el.tagName;
      // Block text inputs and textareas, but allow range sliders (type="range")
      // so Q/W/E still trigger pads while a slider is focused.
      const isTextInput = tag === 'TEXTAREA' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range');
      if (isTextInput || e.repeat) return;
      const idx = KEY_MAP[e.key.toLowerCase()];
      if (idx === undefined) return;
      const pad = pads[idx];
      if (pad?.sample) { e.preventDefault(); triggerSample(pad.id, pad.sample); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pads, triggerSample]);

  return (
    <div className="pad-grid-section">
      {/* ── Toolbar ── */}
      <div className="pg-toolbar">
        <div className="pg-bank-info">
          <span className="pg-bank-label">BANK</span>
          <span className="pg-bank-name">{BANK_NAMES[safeBank] ?? safeBank + 1}</span>
          <span className="pg-sample-count">{banks[safeBank]?.length ?? 0} / 9</span>
        </div>

        <div className="pg-bank-nav">
          <button className="pg-nav-btn" onClick={() => handleBankChange(safeBank - 1)}
            disabled={safeBank === 0} aria-label="Previous bank">‹</button>
          {banks.map((_, i) => (
            <button key={i}
              className={`pg-bank-dot ${i === safeBank ? 'pg-bank-dot--active' : ''}`}
              onClick={() => handleBankChange(i)}
              aria-label={`Bank ${BANK_NAMES[i] ?? i + 1}`}
            />
          ))}
          <button className="pg-nav-btn" onClick={() => handleBankChange(safeBank + 1)}
            disabled={safeBank === banks.length - 1} aria-label="Next bank">›</button>
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
      </div>

      {/* ── 3×3 Grid ── */}
      <div className="pad-grid" role="group" aria-label="Pad sampler">
        {pads.map((pad) => (
          <Pad
            key={pad.id}
            pad={pad}
            isPlaying={playingPads.has(pad.id)}
            isSelected={selectedPad?.id === pad.id}
            onTrigger={handleTrigger}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {/* ── Settings Panel ── */}
      {selectedPad && (
        <PadSettings
          padId={selectedPad.id}
          padLabel={selectedPad.sample?.label ?? `Pad ${selectedPad.number}`}
          sample={selectedPad.sample ?? undefined}
          allPadIds={allPadIds}
          onClose={() => setSelectedPad(null)}
        />
      )}

      {/* ── Legend ── */}
      {!selectedPad && (
        <div className="pg-legend">
          <span className="pg-legend-text">
            Click pads or use Q W E · A S D · Z X C · ⚙ to edit
          </span>
        </div>
      )}
    </div>
  );
}
