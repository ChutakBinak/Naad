import { useRef, useCallback, useEffect, useState } from 'react';
import { usePadStore } from '../store/padStore';
import { usePadSettingsStore, computePlaybackRate, type LoopMode } from '../store/padSettingsStore';
import type { Sample } from '../types';

// ── Buffer helpers ────────────────────────────────────────────────────────────

/** Slice an AudioBuffer to [startRatio, endRatio] and return a new buffer. */
function sliceBuffer(ctx: AudioContext, src: AudioBuffer, startRatio: number, endRatio: number): AudioBuffer {
  const s0  = Math.floor(startRatio * src.length);
  const s1  = Math.ceil(endRatio   * src.length);
  const len = Math.max(1, s1 - s0);
  const out = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    out.copyToChannel(src.getChannelData(ch).slice(s0, s1), ch);
  }
  return out;
}

/** Reverse all channels of a buffer in-place and return it. */
function reverseBuffer(ctx: AudioContext, src: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const data = src.getChannelData(ch).slice().reverse();
    out.copyToChannel(data, ch);
  }
  return out;
}

/** Concatenate two buffers end-to-end (must have same channels + sampleRate). */
function concatBuffers(ctx: AudioContext, a: AudioBuffer, b: AudioBuffer): AudioBuffer {
  const len = a.length + b.length;
  const out = ctx.createBuffer(a.numberOfChannels, len, a.sampleRate);
  for (let ch = 0; ch < a.numberOfChannels; ch++) {
    const arr = new Float32Array(len);
    arr.set(a.getChannelData(ch), 0);
    arr.set(b.getChannelData(ch), a.length);
    out.copyToChannel(arr, ch);
  }
  return out;
}

/**
 * Prepare an AudioBuffer for playback given trim points and loop mode.
 * Returns { buffer, loopStart, loopEnd, startOffset } ready to pass to a
 * BufferSourceNode.  The returned buffer may be a newly-allocated copy.
 */
function prepareBuffer(
  ctx: AudioContext,
  src: AudioBuffer,
  startRatio: number,
  endRatio:   number,
  loopMode:   LoopMode,
): { buffer: AudioBuffer; loopStart: number; loopEnd: number; startOffset: number } {
  const sr = Math.min(Math.max(startRatio, 0), 1);
  const er = Math.min(Math.max(endRatio,   0), 1);
  const safeEnd = Math.max(sr + 0.001, er); // guard zero-length slice

  switch (loopMode) {
    case 'forward': {
      // Use original buffer with loopStart / loopEnd — no copy needed
      const ls = sr * src.duration;
      const le = safeEnd * src.duration;
      return { buffer: src, loopStart: ls, loopEnd: le, startOffset: ls };
    }
    case 'reverse': {
      // Slice then reverse; the new buffer plays from 0 → duration
      const sliced   = sliceBuffer(ctx, src, sr, safeEnd);
      const reversed = reverseBuffer(ctx, sliced);
      return { buffer: reversed, loopStart: 0, loopEnd: reversed.duration, startOffset: 0 };
    }
    case 'ping-pong': {
      // Slice → [forward + reversed] concatenated; loop the full thing
      const sliced   = sliceBuffer(ctx, src, sr, safeEnd);
      const reversed = reverseBuffer(ctx, sliced);
      const pp       = concatBuffers(ctx, sliced, reversed);
      return { buffer: pp, loopStart: 0, loopEnd: pp.duration, startOffset: 0 };
    }
    default: {
      // 'off' — use original buffer, start/end via start() offset+duration
      return { buffer: src, loopStart: 0, loopEnd: src.duration, startOffset: sr * src.duration };
    }
  }
}

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
      const { attack, decay, sustain, release, startRatio, endRatio, loopMode } = settings;
      const isLooping = loopMode !== 'off';

      gainNode.gain.setValueAtTime(0,       t0);
      gainNode.gain.linearRampToValueAtTime(1,       t0 + attack);
      gainNode.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
      gainNode.gain.setValueAtTime(sustain,           t0 + attack + decay);

      const playbackRate = computePlaybackRate(settings);

      if (!isLooping) {
        // Auto-release at end of trimmed region
        const sliceDuration    = (endRatio - startRatio) * (sample.audioBuffer?.duration ?? sample.durationMs / 1000);
        const adjustedDuration = sliceDuration / playbackRate;
        const releaseStart     = Math.max(t0 + attack + decay, t0 + adjustedDuration - release);
        gainNode.gain.setValueAtTime(sustain, releaseStart);
        gainNode.gain.linearRampToValueAtTime(0, releaseStart + release);
      }
      // For looping modes sustain holds indefinitely; stopPad() triggers the release.

      gainNode.connect(master); // → masterGain → destination (+ optional captureDestination)

      // Prepare buffer (trim + loop mode transforms)
      const { buffer, loopStart, loopEnd, startOffset } = prepareBuffer(
        ctx, sample.audioBuffer, startRatio, endRatio, loopMode,
      );

      // Source node
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer            = buffer;
      sourceNode.playbackRate.value = playbackRate;
      sourceNode.connect(gainNode);

      if (isLooping) {
        sourceNode.loop      = true;
        sourceNode.loopStart = loopStart;
        sourceNode.loopEnd   = loopEnd;
        sourceNode.start(t0, startOffset);
      } else {
        // Non-looping: play only the trimmed slice
        const sliceDuration = (endRatio - startRatio) * buffer.duration;
        sourceNode.start(t0, startOffset, sliceDuration / playbackRate);
      }

      sourceNode.onended = () => {
        setPadPlaying(padId, false);
        activePads.current.delete(padId);
      };

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
