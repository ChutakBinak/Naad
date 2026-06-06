import { useCallback, useEffect, useRef, useState } from 'react';
import { useSequencerStore } from '../store/sequencerStore';
import { useSequencer } from '../hooks/useSequencer';
import type { Sample } from '../utils/audioSlicer';

const PAD_LABELS = ['Q','W','E','A','S','D','Z','X','C'];

interface SequencerProps { samples: Sample[]; }

export function Sequencer({ samples }: SequencerProps) {
  const {
    bpm, bars, isLooping, metronomeOn, quantize, transportState, currentStep, steps,
    setBpm, setBars, setLooping, setMetronome, setQuantize,
    toggleStep, clearAll, exportProject, importProject,
  } = useSequencerStore();

  const { play, stop, recordPadHit, triggerNow, exportWav } = useSequencer(samples);

  const [isExporting, setIsExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isRunning   = transportState !== 'stopped';
  const isRecording = transportState === 'recording';
  const totalSteps  = bars * 16;

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); isRunning ? stop() : play(); }
      if (e.key.toLowerCase() === 'r' && !isRunning) { e.preventDefault(); play(true); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isRunning, play, stop]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const blob = await exportWav();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `naad-seq-${Date.now()}.wav`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally { setIsExporting(false); }
  }, [exportWav]);

  const handleSave = () => {
    const blob = exportProject();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `naad-project-${Date.now()}.json`; a.click();
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result as string); if (d.version === '1') importProject(d); } catch {}
    };
    r.readAsText(f); e.target.value = '';
  };

  return (
    <div className="sequencer">
      {/* Transport */}
      <div className="seq-transport">
        <div className="seq-trans-row">
          <button className={`seq-btn seq-btn--rec ${isRecording ? 'seq-btn--active' : ''}`}
            onClick={isRunning ? stop : () => play(true)}>
            {isRecording ? '■' : '●'}
          </button>
          <button className={`seq-btn seq-btn--play ${isRunning && !isRecording ? 'seq-btn--active' : ''}`}
            onClick={isRunning ? stop : () => play()}>
            {isRunning && !isRecording ? '■' : '▶'}
          </button>

          <div className="seq-bpm">
            <span className="seq-label">BPM</span>
            <input type="number" className="seq-bpm-input" min={20} max={300} value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))} />
          </div>

          <div className="seq-bars">
            <span className="seq-label">BARS</span>
            <div className="seq-bar-btns">
              {[1,2].map((b) => (
                <button key={b} className={`seq-bar-btn ${b === bars ? 'seq-bar-btn--active' : ''}`}
                  onClick={() => setBars(b)}>{b}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="seq-trans-row seq-toggles">
          {[
            { label: 'LOOP', v: isLooping, set: setLooping },
            { label: 'CLICK', v: metronomeOn, set: setMetronome },
            { label: 'SNAP', v: quantize, set: setQuantize },
          ].map(({ label, v, set }) => (
            <button key={label} className={`seq-toggle ${v ? 'seq-toggle--on' : ''}`}
              onClick={() => set(!v)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Step grid */}
      <div className="seq-grid-wrap">
        {steps.map((track, pi) => {
          const s = samples[pi];
          return (
            <div key={pi} className="seq-row">
              <span className="seq-row-label" title={s?.label}>{s ? s.label : PAD_LABELS[pi]}</span>
              <div className="seq-row-cells" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
                {Array.from({ length: totalSteps }, (_, si) => (
                  <button key={si}
                    className={[
                      'seq-cell',
                      track[si] ? 'seq-cell--on' : 'seq-cell--off',
                      si === currentStep ? 'seq-cell--cur' : '',
                      si % 4 === 0 ? 'seq-cell--beat' : '',
                    ].join(' ')}
                    onClick={() => s && toggleStep(pi, si)}
                    disabled={!s}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live pads (recording) */}
      {isRecording && (
        <div className="seq-live">
          <span className="seq-live-label">TAP TO RECORD</span>
          <div className="seq-live-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <button key={i}
                className={`seq-live-pad ${samples[i] ? '' : 'seq-live-pad--empty'}`}
                disabled={!samples[i]}
                onMouseDown={() => { triggerNow(i); recordPadHit(i); }}>
                <span className="seq-lp-key">{PAD_LABELS[i]}</span>
                {samples[i] && <span className="seq-lp-name">{samples[i].label}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="seq-bottom">
        <button className="seq-act seq-act--danger" onClick={clearAll}>✕ Clear</button>
        <button className="seq-act" onClick={handleSave}>↓ Save</button>
        <button className="seq-act" onClick={() => fileRef.current?.click()}>↑ Load</button>
        <button className="seq-act seq-act--primary" onClick={handleExport} disabled={isExporting}>
          {isExporting ? '…' : '↓ WAV'}
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoad} />
      </div>
    </div>
  );
}
