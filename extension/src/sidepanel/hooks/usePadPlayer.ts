import { useRef, useCallback, useEffect } from 'react';
import { usePadStore } from '../store/padStore';
import { usePadSettingsStore, computePlaybackRate } from '../store/padSettingsStore';
import type { Sample } from '../utils/audioSlicer';

interface ActivePad { source: AudioBufferSourceNode; gain: GainNode; }

export function usePadPlayer() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activePads  = useRef<Map<string, ActivePad>>(new Map());
  const { setPadPlaying, clearAllPlaying } = usePadStore();
  const { getSettings }                    = usePadSettingsStore();

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext({ latencyHint: 'interactive' });
    }
    return audioCtxRef.current;
  }, []);

  const triggerSample = useCallback((padId: string, sample: Sample) => {
    const ctx      = getCtx();
    const settings = getSettings(padId);
    if (ctx.state === 'suspended') ctx.resume();

    const existing = activePads.current.get(padId);
    if (existing) {
      existing.gain.gain.cancelScheduledValues(ctx.currentTime);
      try { existing.source.stop(); } catch { /* */ }
      activePads.current.delete(padId);
    }

    const { attack, decay, sustain, release } = settings;
    const gainNode = ctx.createGain();
    const t0 = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, t0);
    gainNode.gain.linearRampToValueAtTime(1, t0 + attack);
    gainNode.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
    gainNode.gain.setValueAtTime(sustain, t0 + attack + decay);

    const rate             = computePlaybackRate(settings);
    const adjustedDuration = (sample.durationMs / 1000) / rate;
    const releaseStart     = Math.max(t0 + attack + decay, t0 + adjustedDuration - release);
    gainNode.gain.setValueAtTime(sustain, releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, releaseStart + release);
    gainNode.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = sample.audioBuffer;
    source.playbackRate.value = rate;
    source.connect(gainNode);
    source.onended = () => { setPadPlaying(padId, false); activePads.current.delete(padId); };
    source.start(t0);
    activePads.current.set(padId, { source, gain: gainNode });
    setPadPlaying(padId, true);
  }, [getCtx, getSettings, setPadPlaying]);

  const stopAll = useCallback(() => {
    activePads.current.forEach(({ source, gain }) => {
      gain.gain.cancelScheduledValues(0);
      try { source.stop(); } catch { /* */ }
    });
    activePads.current.clear();
    clearAllPlaying();
  }, [clearAllPlaying]);

  useEffect(() => () => { stopAll(); audioCtxRef.current?.close(); }, [stopAll]);

  return { triggerSample, stopAll };
}
