import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer } from './components/Timer';
import { CueList } from './components/CueList';
import { SampleList } from './components/SampleList';
import { PadGrid } from './components/PadGrid';
import { Sequencer } from './components/Sequencer';
import { useRecordingStore } from './store/recordingStore';
import { useSamplesStore } from './store/samplesStore';
import { usePadStore } from './store/padStore';
import { usePadSettingsStore } from './store/padSettingsStore';
import { useSequencerStore } from './store/sequencerStore';
import { useDBPersistence } from './hooks/useDBPersistence';
import { clearAllDB } from './db/operations';
import { sliceAudio } from './utils/audioSlicer';
import { LevelMeter } from './components/LevelMeter';
import type { ExportData } from './types';

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
function getSupportedMimeType(): string {
  for (const t of MIME_TYPES) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

type AppView = 'pads' | 'samples' | 'seq';

export function App() {
  const {
    state, elapsed, cuePoints, audioUrl,
    error, setState, setElapsed, addCue,
    setAudioBlob, setError, reset: resetRecording,
  } = useRecordingStore();

  const {
    samples, isSlicing, sliceProgress, sliceError,
    setSamples, setSlicing, setSliceProgress, setSliceError, clearSamples,
  } = useSamplesStore();

  const { clearAllPlaying } = usePadStore();
  const { clearAll: clearAllSettings } = usePadSettingsStore();
  const { clearAll: clearSequencer } = useSequencerStore();

  const { isHydrating } = useDBPersistence();

  const [view, setView] = useState<AppView>('pads');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const startTimeRef     = useRef<number>(0);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const blobRef          = useRef<Blob | null>(null);
  const monitorCtxRef    = useRef<AudioContext | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Auto-switch to pads when samples arrive
  useEffect(() => { if (samples.length > 0) setView('pads'); }, [samples.length]);

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError(null);

    // ── Create and resume AudioContext as the VERY FIRST await ──────────────
    // chrome.tabCapture.capture is async; once we cross that await boundary,
    // Chrome's user-gesture activation token may be expired, and
    // AudioContext.resume() will silently fail — the captured tab stays muted.
    // By resuming here (first await, still inside the button-click handler) we
    // guarantee the context is running before we even request the stream.
    const monitorCtx = new AudioContext({ latencyHint: 'interactive' });
    monitorCtxRef.current = monitorCtx;
    await monitorCtx.resume(); // ← first await: gesture token is still valid

    try {
      // chrome.tabCapture MUTES the captured tab — audio is rerouted through
      // monitorCtx.destination (already running above) so the user can hear it.
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture({ audio: true, video: false }, (s) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (!s) reject(new Error('No stream returned'));
          else resolve(s);
        });
      });

      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType    = getSupportedMimeType();
      const recorder    = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      // monitorCtx is already running — wire the captured stream through it
      const monitorSrc = monitorCtx.createMediaStreamSource(stream);
      const analyser   = monitorCtx.createAnalyser();
      analyser.fftSize = 256;
      monitorSrc.connect(monitorCtx.destination); // restore audible output
      monitorSrc.connect(analyser);               // tap for level meter
      setAnalyserNode(analyser);

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        blobRef.current = blob;
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        monitorCtxRef.current?.close().catch(() => {});
        monitorCtxRef.current = null;
        setAnalyserNode(null);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      startTimeRef.current     = Date.now();
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 50);
    } catch (err) {
      // Capture failed — close the AudioContext we already created
      monitorCtx.close().catch(() => {});
      monitorCtxRef.current = null;
      setError(err instanceof Error ? err.message : 'Failed to capture audio');
    }
  }, [setState, setElapsed, setAudioBlob, setError]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setElapsed(Date.now() - startTimeRef.current);
      mediaRecorderRef.current.stop();
    }
    setState('stopped');
  }, [setState, setElapsed]);

  const handleCue = useCallback(() => {
    if (state !== 'recording') return;
    addCue(Date.now() - startTimeRef.current);
  }, [state, addCue]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.code === 'Space' && state === 'recording') { e.preventDefault(); handleCue(); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [state, handleCue]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    monitorCtxRef.current?.close().catch(() => {});
  }, []);

  // ── Slice ─────────────────────────────────────────────────────────────────
  const handleSlice = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setSlicing(true); setSliceError(null);
    try {
      const sliced = await sliceAudio(blob, cuePoints, (pct) => setSliceProgress(pct));
      setSamples(sliced);
    } catch (err) {
      setSliceError(err instanceof Error ? err.message : 'Failed to slice');
    } finally { setSlicing(false); }
  }, [cuePoints, setSamples, setSlicing, setSliceProgress, setSliceError]);

  // ── Export raw ────────────────────────────────────────────────────────────
  const handleExportRaw = useCallback(() => {
    if (!audioUrl) return;
    const ts = Date.now();
    const al = document.createElement('a');
    al.href = audioUrl; al.download = `naad-${ts}.webm`; al.click();
    const data: ExportData = {
      version: '1.0', recordedAt: new Date(ts).toISOString(), durationMs: elapsed,
      cuePoints: cuePoints.map((c, i) => ({ index: i + 1, timestampMs: c.timestamp, label: c.label })),
    };
    const jl = document.createElement('a');
    jl.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    jl.download = `naad-cues-${ts}.json`; jl.click();
    setTimeout(() => URL.revokeObjectURL(jl.href), 5000);
  }, [audioUrl, elapsed, cuePoints]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleNewRecording = useCallback(() => {
    blobRef.current = null;
    clearAllPlaying();
    clearAllSettings();
    clearSequencer();
    clearSamples();
    resetRecording();
    setView('pads');
    clearAllDB().catch((e) => console.warn('[naad-ext] clearAllDB:', e));
  }, [clearAllPlaying, clearAllSettings, clearSequencer, clearSamples, resetRecording]);

  const hasSamples = samples.length > 0;

  if (isHydrating) {
    return (
      <div className="app app--loading">
        <div className="hydrate-spinner" aria-label="Loading…">
          <div className="hydrate-ring" />
          <span className="hydrate-label">naad</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-name">naad</span>
          <span className="logo-tag">/ sampler</span>
        </div>

        {hasSamples ? (
          <div className="tab-bar">
            <button className={`tab ${view === 'pads'    ? 'tab--active' : ''}`} onClick={() => setView('pads')}>▦</button>
            <button className={`tab ${view === 'samples' ? 'tab--active' : ''}`} onClick={() => setView('samples')}>≋</button>
            <button className={`tab ${view === 'seq' ? 'tab--active' : ''}`} onClick={() => setView('seq')}>⊞</button>
          </div>
        ) : (
          <span className="phase-badge">phase 5</span>
        )}
      </header>

      <main className="main">
        {hasSamples && view === 'pads' && (
          <PadGrid samples={samples} onNewRecording={handleNewRecording} />
        )}

        {hasSamples && view === 'samples' && (
          <SampleList samples={samples} onNewRecording={handleNewRecording} />
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
                <span>{error ?? sliceError}</span>
                <button className="error-dismiss" onClick={() => { setError(null); setSliceError(null); }}>✕</button>
              </div>
            )}

            <section className="controls">
              {state === 'idle' && (
                <button className="btn btn--start" onClick={startRecording}>
                  <span className="btn-icon">▶</span> Start Recording
                </button>
              )}

              {state === 'recording' && (
                <div className="controls-recording">
                  <LevelMeter analyserNode={analyserNode} />
                  <button className="btn btn--cue" onClick={handleCue}>
                    <span className="btn-icon">◆</span> Cue <kbd>Space</kbd>
                  </button>
                  <button className="btn btn--stop" onClick={stopRecording}>
                    <span className="btn-icon">■</span> Stop
                  </button>
                </div>
              )}

              {state === 'stopped' && (
                <div className="controls-stopped">
                  {audioUrl && (
                    <div className="playback">
                      <p className="playback-label">Preview</p>
                      <audio controls src={audioUrl} className="audio-player" />
                    </div>
                  )}

                  {isSlicing ? (
                    <div className="slice-progress">
                      <div className="slice-bar"><div className="slice-fill" style={{ width: `${sliceProgress}%` }} /></div>
                      <p className="slice-label">Slicing… {sliceProgress}%</p>
                    </div>
                  ) : (
                    <div className="stopped-controls-btns">
                      <button className="btn btn--slice" onClick={handleSlice} disabled={!audioUrl}>
                        <span className="btn-icon">⊘</span>
                        Slice into Samples
                        <span className="btn-sub">{cuePoints.length + 1} sample{cuePoints.length + 1 !== 1 ? 's' : ''}</span>
                      </button>
                      <div className="stopped-secondary">
                        <button className="btn btn--export btn--sm" onClick={handleExportRaw} disabled={!audioUrl}>↓ Raw</button>
                        <button className="btn btn--reset btn--sm" onClick={handleNewRecording}>↺ New</button>
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
          {hasSamples && view === 'pads'    && 'Q W E · A S D · Z X C'}
          {hasSamples && view === 'samples' && `${samples.length} samples`}
          {!hasSamples && state === 'recording' && 'Capturing · Space to cue'}
          {!hasSamples && state === 'idle'      && 'Captures audio from active tab'}
          {!hasSamples && state === 'stopped'   && `${cuePoints.length} cue${cuePoints.length !== 1 ? 's' : ''} · ready to slice`}
        </p>
      </footer>
    </div>
  );
}
