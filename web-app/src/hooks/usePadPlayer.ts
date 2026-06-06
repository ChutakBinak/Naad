import { useRef, useCallback, useEffect, useState } from 'react';
import { usePadStore } from '../store/padStore';
import { usePadSettingsStore, computePlaybackRate } from '../store/padSettingsStore';
import type { Sample } from '../types';

interface ActivePad {
  source: AudioBufferSourceNode;
  gain:   GainNode;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];
function getSupportedMime() {
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

/**
 * Low-latency pad playback via Web Audio API.
 *
 * Audio graph:
 *   BufferSource → padGain (ADSR) → masterGain → ctx.destination
 *                                              ↘ captureDestination (when recording)
 */
export function usePadPlayer() {
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const masterGainRef  = useRef<GainNode | null>(null);
  const activePads     = useRef<Map<string, ActivePad>>(new Map());
  const { setPadPlaying, clearAllPlaying } = usePadStore();
  const { getSettings }                    = usePadSettingsStore();

  // ── Capture state ─────────────────────────────────────────────────────────
  const [isCapturing, setIsCapturing]      = useState(false);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const captureDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const captureChunks = useRef<Blob[]>([]);

  // ── Shared AudioContext + master gain ─────────────────────────────────────
  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx    = new AudioContext({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.connect(ctx.destination);
      audioCtxRef.current   = ctx;
      masterGainRef.current = master;
    }
    return audioCtxRef.current;
  }, []);

  // ── Trigger ───────────────────────────────────────────────────────────────
  const triggerSample = useCallback(
    (padId: string, sample: Sample) => {
      const ctx      = getCtx();
      const settings = getSettings(padId);
      const master   = masterGainRef.current!;

      // Always call resume — it's a no-op when already running and ensures
      // the context is unblocked on the very first user gesture.
      ctx.resume().catch(() => {});

      // Stop existing node (retrigger)
      const existing = activePads.current.get(padId);
      if (existing) {
        existing.gain.gain.cancelScheduledValues(ctx.currentTime);
        try { existing.source.stop(); } catch { /* already ended */ }
        activePads.current.delete(padId);
      }

      // ADSR gain node
      const gainNode = ctx.createGain();
      const t0       = ctx.currentTime;
      const { attack, decay, sustain, release } = settings;

      gainNode.gain.setValueAtTime(0,       t0);
      gainNode.gain.linearRampToValueAtTime(1,       t0 + attack);
      gainNode.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
      gainNode.gain.setValueAtTime(sustain,           t0 + attack + decay);

      const playbackRate     = computePlaybackRate(settings);
      const adjustedDuration = (sample.durationMs / 1000) / playbackRate;
      const releaseStart     = Math.max(t0 + attack + decay, t0 + adjustedDuration - release);
      gainNode.gain.setValueAtTime(sustain, releaseStart);
      gainNode.gain.linearRampToValueAtTime(0, releaseStart + release);

      gainNode.connect(master); // → masterGain → destination (+ optional captureDestination)

      // Source node
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer            = sample.audioBuffer;
      sourceNode.playbackRate.value = playbackRate;
      sourceNode.connect(gainNode);

      sourceNode.onended = () => {
        setPadPlaying(padId, false);
        activePads.current.delete(padId);
      };

      sourceNode.start(t0);
      activePads.current.set(padId, { source: sourceNode, gain: gainNode });
      setPadPlaying(padId, true);
    },
    [getCtx, getSettings, setPadPlaying],
  );

  // ── Stop a single pad (with release) ─────────────────────────────────────
  const stopPad = useCallback(
    (padId: string) => {
      const pad = activePads.current.get(padId);
      if (!pad) return;
      const ctx     = getCtx();
      const release = getSettings(padId).release;
      const t0      = ctx.currentTime;
      pad.gain.gain.cancelScheduledValues(t0);
      pad.gain.gain.setValueAtTime(pad.gain.gain.value, t0);
      pad.gain.gain.linearRampToValueAtTime(0, t0 + release);
      pad.source.stop(t0 + release + 0.01);
      activePads.current.delete(padId);
      setPadPlaying(padId, false);
    },
    [getCtx, getSettings, setPadPlaying],
  );

  // ── Stop everything ───────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    activePads.current.forEach(({ source, gain }) => {
      gain.gain.cancelScheduledValues(0);
      try { source.stop(); } catch { /* */ }
    });
    activePads.current.clear();
    clearAllPlaying();
  }, [clearAllPlaying]);

  // ── Performance recording ─────────────────────────────────────────────────
  // NOT async — keeping this synchronous preserves the browser's user-gesture
  // token so ctx.resume() is granted. An async boundary can silently drop it.
  const startCapture = useCallback(() => {
    const ctx    = getCtx();
    const master = masterGainRef.current!;
    ctx.resume().catch(() => {}); // fire-and-forget; pad triggers will re-resume if needed

    const dest  = ctx.createMediaStreamDestination();
    master.connect(dest);
    captureDestRef.current = dest;
    captureChunks.current  = [];

    const mime     = getSupportedMime();
    const recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) captureChunks.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(captureChunks.current, { type: mime || 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `naad-performance-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      // Disconnect the capture branch
      if (captureDestRef.current) {
        try { master.disconnect(captureDestRef.current); } catch { /* */ }
        captureDestRef.current = null;
      }
    };

    recorder.start(100);
    recorderRef.current = recorder;
    setIsCapturing(true);
  }, [getCtx]);

  const stopCapture = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setIsCapturing(false);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopAll();
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    audioCtxRef.current?.close();
  }, [stopAll]);

  return { triggerSample, stopPad, stopAll, isCapturing, startCapture, stopCapture };
}
