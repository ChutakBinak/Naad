import { useRef, useCallback, useEffect } from 'react';
import { usePadStore } from '../store/padStore';
import { usePadSettingsStore, computePlaybackRate } from '../store/padSettingsStore';
import type { Sample } from '../types';

interface ActivePad {
  source: AudioBufferSourceNode;
  gain:   GainNode;
}

/**
 * Low-latency pad playback via Web Audio API.
 * Applies per-pad ADSR envelope + pitch/speed on every trigger.
 */
export function usePadPlayer() {
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const activePads   = useRef<Map<string, ActivePad>>(new Map());
  const { setPadPlaying, clearAllPlaying } = usePadStore();
  const { getSettings }                    = usePadSettingsStore();

  // ── Shared AudioContext ───────────────────────────────────────────────────
  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ latencyHint: 'interactive' });
    }
    return audioCtxRef.current;
  }, []);

  // ── Trigger ───────────────────────────────────────────────────────────────
  const triggerSample = useCallback(
    (padId: string, sample: Sample) => {
      const ctx      = getCtx();
      const settings = getSettings(padId);

      if (ctx.state === 'suspended') ctx.resume();

      // ── Stop existing node for this pad (retrigger) ──
      const existing = activePads.current.get(padId);
      if (existing) {
        existing.gain.gain.cancelScheduledValues(ctx.currentTime);
        try { existing.source.stop(); } catch { /* already ended */ }
        activePads.current.delete(padId);
      }

      // ── ADSR gain node ───────────────────────────────
      const gainNode = ctx.createGain();
      const t0       = ctx.currentTime;
      const { attack, decay, sustain, release } = settings;

      gainNode.gain.setValueAtTime(0,       t0);
      gainNode.gain.linearRampToValueAtTime(1,       t0 + attack);
      gainNode.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
      gainNode.gain.setValueAtTime(sustain,           t0 + attack + decay);

      // Schedule release before sample ends
      const playbackRate    = computePlaybackRate(settings);
      const adjustedDuration = (sample.durationMs / 1000) / playbackRate;
      const releaseStart    = Math.max(
        t0 + attack + decay,
        t0 + adjustedDuration - release,
      );
      gainNode.gain.setValueAtTime(sustain, releaseStart);
      gainNode.gain.linearRampToValueAtTime(0, releaseStart + release);

      gainNode.connect(ctx.destination);

      // ── Source node ──────────────────────────────────
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer       = sample.audioBuffer;
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
      const ctx      = getCtx();
      const release  = getSettings(padId).release;
      const t0       = ctx.currentTime;
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

  useEffect(() => () => {
    stopAll();
    audioCtxRef.current?.close();
  }, [stopAll]);

  return { triggerSample, stopPad, stopAll };
}
