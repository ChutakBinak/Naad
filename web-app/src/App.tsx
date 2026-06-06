import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer } from './components/Timer';
import { CueList } from './components/CueList';
import { SampleGrid } from './components/SampleGrid';
import { PadGrid } from './components/PadGrid';
import { Sequencer } from './components/Sequencer';
import { useRecordingStore } from './store/recordingStore';
import { useSamplesStore } from './store/samplesStore';
import { usePadStore } from './store/padStore';
import { usePadSettingsStore } from './store/padSettingsStore';
import { useSequencerStore } from './store/sequencerStore';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useDBPersistence } from './hooks/useDBPersistence';
import { clearAllDB } from './db/operations';
import { sliceAudio } from './utils/audioSlicer';
import type { ExportData } from './types';

type AppView = 'pads' | 'samples' | 'seq';

export function App() {
  const {
    state,
    elapsed,
    cuePoints,
    audioBlob,
    audioUrl,
    error,
    setError,
    reset: resetRecording,
  } = useRecordingStore();

  const {
    samples,
    isSlicing,
    sliceProgress,
    sliceError,
    setSamples,
    setSlicing,
    setSliceProgress,
    setSliceError,
    clearSamples,
  } = useSamplesStore();

  const { clearAllPlaying } = usePadStore();
  const { clearAll: clearAllSettings } = usePadSettingsStore();
  const { clearAll: clearSequencer } = useSequencerStore();

  const {
    startDisplayCapture,
    startFromFile,
    stopRecording,
    addCuePoint,
    cleanup,
  } = useAudioRecorder();

  const { isHydrating } = useDBPersistence();

  const [view, setView] = useState<AppView>('pads');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-switch to pads view when samples arrive
  useEffect(() => {
    if (samples.length > 0) setView('pads');
  }, [samples.length]);

  // ── Keyboard: Space = cue ────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') return;
      if (e.code === 'Space' && state === 'recording') {
        e.preventDefault();
        addCuePoint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, addCuePoint]);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── File load ─────────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) startFromFile(file);
      e.target.value = '';
    },
    [startFromFile],
  );

  // ── Slice ─────────────────────────────────────────────────────────────────
  const handleSlice = useCallback(async () => {
    if (!audioBlob) return;
    setSlicing(true);
    setSliceError(null);
    try {
      const { samples } = await sliceAudio(
        audioBlob,
        cuePoints.map((c) => c.timestamp),
        (pct) => setSliceProgress(pct),
      );
      setSamples(samples);
    } catch (err) {
      setSliceError(err instanceof Error ? err.message : 'Failed to slice audio');
    } finally {
      setSlicing(false);
    }
  }, [audioBlob, cuePoints, setSamples, setSlicing, setSliceProgress, setSliceError]);

  // ── Raw export ────────────────────────────────────────────────────────────
  const handleExportRaw = useCallback(() => {
    if (!audioUrl) return;
    const ts = Date.now();
    const al = document.createElement('a');
    al.href = audioUrl; al.download = `naad-recording-${ts}.webm`; al.click();
    const data: ExportData = {
      version: '1.0', recordedAt: new Date(ts).toISOString(), durationMs: elapsed,
      cuePoints: cuePoints.map((c, i) => ({ index: i + 1, timestampMs: c.timestamp, label: c.label })),
    };
    const jl = document.createElement('a');
    jl.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    jl.download = `naad-cues-${ts}.json`; jl.click();
    setTimeout(() => URL.revokeObjectURL(jl.href), 5000);
  }, [audioUrl, elapsed, cuePoints]);

  // ── Full reset ────────────────────────────────────────────────────────────
  const handleNewRecording = useCallback(() => {
    clearAllPlaying();
    clearAllSettings();
    clearSequencer();
    clearSamples();
    resetRecording();
    setView('pads');
    clearAllDB().catch((e) => console.warn('[naad] clearAllDB:', e));
  }, [clearAllPlaying, clearAllSettings, clearSequencer, clearSamples, resetRecording]);

  const hasSamples = samples.length > 0;

  if (isHydrating) {
    return (
      <div className="app app--loading">
        <div className="hydrate-spinner" aria-label="Loading saved session…">
          <div className="hydrate-ring" />
          <span className="hydrate-label">naad</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-name">naad</span>
            <span className="logo-tag">/ sampler</span>
          </div>
          <span className="phase-badge">phase 3</span>
        </div>

        {/* Tab bar — only shown when samples are ready */}
        {hasSamples && (
          <div className="tab-bar" role="tablist">
            <button
              className={`tab ${view === 'pads' ? 'tab--active' : ''}`}
              onClick={() => setView('pads')}
              role="tab"
              aria-selected={view === 'pads'}
            >
              ▦ Pads
            </button>
            <button
              className={`tab ${view === 'samples' ? 'tab--active' : ''}`}
              onClick={() => setView('samples')}
              role="tab"
              aria-selected={view === 'samples'}
            >
              ≋ Samples
            </button>
            <button
              className={`tab ${view === 'seq' ? 'tab--active' : ''}`}
              onClick={() => setView('seq')}
              role="tab"
              aria-selected={view === 'seq'}
            >
              ⊞ Seq
            </button>
          </div>
        )}
      </header>

      <main className="main">
        {hasSamples && view === 'pads' && (
          <PadGrid samples={samples} />
        )}

        {hasSamples && view === 'samples' && (
          <SampleGrid samples={samples} onNewRecording={handleNewRecording} />
        )}

        {hasSamples && view === 'seq' && (
          <Sequencer samples={samples} />
        )}

        {!hasSamples && (
          <>
            <Timer elapsed={elapsed} isRecording={state === 'recording'} />

            {(error || sliceError) && (
              <div className="error-banner" role="alert">
                <span className="error-icon">⚠</span>
                <span className="error-text">{error ?? sliceError}</span>
                <button className="error-dismiss" onClick={() => { setError(null); setSliceError(null); }}>✕</button>
              </div>
            )}

            <section className="controls">
              {state === 'idle' && (
                <div className="idle-controls">
                  <div className="source-section">
                    <p className="source-label">CAPTURE SOURCE</p>
                    <button className="btn btn--start" onClick={startDisplayCapture}>
                      <span className="btn-icon">⊕</span> Capture Tab Audio
                    </button>
                    <div className="source-hint">
                      Select a tab and enable <strong>"Share tab audio"</strong>
                    </div>
                  </div>
                  <div className="divider"><span>or</span></div>
                  <div className="source-section">
                    <p className="source-label">FROM FILE</p>
                    <button className="btn btn--secondary" onClick={() => fileInputRef.current?.click()}>
                      <span className="btn-icon">↑</span> Load Audio File
                    </button>
                    <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />
                    <div className="source-hint">Mark cue points on an existing file</div>
                  </div>
                </div>
              )}

              {state === 'requesting' && (
                <div className="requesting-state">
                  <div className="spinner" />
                  <p className="requesting-text">Waiting for permission…</p>
                </div>
              )}

              {state === 'recording' && (
                <div className="recording-controls">
                  <button className="btn btn--cue" onClick={addCuePoint} aria-label="Mark cue point (Space)">
                    <span className="btn-icon">◆</span> Cue <kbd>Space</kbd>
                  </button>
                  <button className="btn btn--stop" onClick={stopRecording} aria-label="Stop">
                    <span className="btn-icon">■</span> Stop
                  </button>
                </div>
              )}

              {state === 'stopped' && (
                <div className="stopped-controls">
                  {audioUrl && (
                    <div className="playback">
                      <p className="playback-label">PREVIEW</p>
                      <audio controls src={audioUrl} className="audio-player" />
                    </div>
                  )}

                  {isSlicing ? (
                    <div className="slice-progress">
                      <div className="slice-progress-bar">
                        <div className="slice-progress-fill" style={{ width: `${sliceProgress}%` }} />
                      </div>
                      <p className="slice-progress-label">Slicing… {sliceProgress}%</p>
                    </div>
                  ) : (
                    <div className="stopped-actions">
                      <button className="btn btn--slice" onClick={handleSlice} disabled={!audioBlob}>
                        <span className="btn-icon">⊘</span>
                        Slice into Samples
                        <span className="btn-sub">{cuePoints.length + 1} sample{cuePoints.length + 1 !== 1 ? 's' : ''}</span>
                      </button>
                      <div className="stopped-secondary">
                        <button className="btn btn--export" onClick={handleExportRaw} disabled={!audioUrl}>↓ Raw</button>
                        <button className="btn btn--reset" onClick={handleNewRecording}>↺ New</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <CueList cuePoints={cuePoints} isRecording={state === 'recording'} />
          </>
        )}
      </main>

      <footer className="footer">
        <p className="footer-hint">
          {hasSamples && view === 'pads'    && 'Click pads or use Q W E · A S D · Z X C'}
          {hasSamples && view === 'samples' && `${samples.length} samples · click a tab to switch`}
          {hasSamples && view === 'seq'     && 'Space to play/stop · R to record · click cells to toggle'}
          {!hasSamples && state === 'recording' && 'Recording · Space to cue'}
          {!hasSamples && state === 'idle'       && 'Select a source to start sampling'}
          {!hasSamples && state === 'stopped'    && `${cuePoints.length} cue point${cuePoints.length !== 1 ? 's' : ''} · ready to slice`}
          {!hasSamples && state === 'requesting' && 'Requesting capture permission…'}
        </p>
        <p className="footer-credit">Naad v0.1.0 · Phase 5</p>
      </footer>
    </div>
  );
}
