import { useCallback, useEffect, useRef, useState } from 'react';
import { Transport } from './Transport';
import { StepGrid } from './StepGrid';
import { useSequencerStore, type ProjectData } from '../store/sequencerStore';
import type { useSequencer } from '../hooks/useSequencer';
import type { Sample } from '../types';
import { formatTime } from '../utils/time';

interface SequencerProps {
  samples: Sample[];
  /** Sequencer transport, lifted to App.tsx so it survives tab switches. */
  sequencer: ReturnType<typeof useSequencer>;
}

const PAD_LABELS = ['Q','W','E','A','S','D','Z','X','C'];

export function Sequencer({ samples, sequencer }: SequencerProps) {
  const {
    transportState, currentStep, bars,
    clearAll, exportProject, importProject,
  } = useSequencerStore();

  const { play, stop, recordPadHit, triggerNow, exportWav } = sequencer;

  const [isExporting, setIsExporting]   = useState(false);
  const [exportError,  setExportError]  = useState<string | null>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);

  const isRecording = transportState === 'recording';
  const isRunning   = transportState !== 'stopped';

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); isRunning ? stop() : play(); }
      if (e.key.toLowerCase() === 'r' && !isRunning) { e.preventDefault(); play(true); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isRunning, play, stop]);

  // ── WAV export ────────────────────────────────────────────────────────────
  const handleExportWav = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const blob = await exportWav();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `naad-sequence-${Date.now()}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [exportWav]);

  // ── Project save ──────────────────────────────────────────────────────────
  const handleSaveProject = useCallback(() => {
    const blob = exportProject();
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `naad-project-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, [exportProject]);

  // ── Project load ──────────────────────────────────────────────────────────
  const handleLoadProject = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as ProjectData;
          if (data.version === '1') importProject(data);
        } catch { /* bad file */ }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [importProject],
  );

  return (
    <div className="sequencer">
      {/* ── Transport ── */}
      <Transport
        onPlay={play}
        onStop={stop}
        onRecord={() => play(true)}
      />

      {/* ── Step indicator ── */}
      <div className="seq-status">
        <span className="seq-status-state">
          {transportState === 'stopped'   && 'STOPPED'}
          {transportState === 'playing'   && 'PLAYING'}
          {transportState === 'recording' && '⏺ RECORDING'}
        </span>
        <span className="seq-status-pos">
          {currentStep >= 0 && (
            <>Step {currentStep + 1}/{bars * 16} · Bar {Math.floor(currentStep / 16) + 1}</>
          )}
        </span>
        <span className="seq-status-hint">
          Space to play/stop · R to record
        </span>
      </div>

      {/* ── Step Grid ── */}
      <StepGrid samples={samples} />

      {/* ── Live trigger pads (visible during recording) ── */}
      {isRecording && (
        <div className="seq-live-pads">
          <p className="seq-live-label">TAP TO RECORD</p>
          <div className="seq-live-grid">
            {Array.from({ length: 9 }, (_, i) => {
              const sample = samples[i];
              return (
                <button
                  key={i}
                  className={`seq-live-pad ${sample ? 'seq-live-pad--filled' : 'seq-live-pad--empty'}`}
                  disabled={!sample}
                  onMouseDown={() => {
                    triggerNow(i);
                    recordPadHit(i);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    triggerNow(i);
                    recordPadHit(i);
                  }}
                >
                  <span className="slp-key">{PAD_LABELS[i]}</span>
                  {sample && (
                    <>
                      <span className="slp-name">{sample.label}</span>
                      <span className="slp-dur">{formatTime(sample.durationMs)}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bottom actions ── */}
      <div className="seq-actions">
        <div className="seq-actions-left">
          <button className="seq-action-btn seq-action-btn--danger" onClick={clearAll}>
            ✕ Clear All
          </button>
        </div>
        <div className="seq-actions-right">
          {exportError && <span className="seq-export-error">{exportError}</span>}
          <button className="seq-action-btn" onClick={handleSaveProject}>
            ↓ Save Project
          </button>
          <button className="seq-action-btn" onClick={() => projectFileRef.current?.click()}>
            ↑ Load Project
          </button>
          <input
            ref={projectFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleLoadProject}
          />
          <button
            className="seq-action-btn seq-action-btn--primary"
            onClick={handleExportWav}
            disabled={isExporting}
          >
            {isExporting ? 'Rendering…' : '↓ Export WAV'}
          </button>
        </div>
      </div>
    </div>
  );
}
