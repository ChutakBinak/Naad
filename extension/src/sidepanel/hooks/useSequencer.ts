import { useRef, useCallback, useEffect } from 'react';
import { useSequencerStore } from '../store/sequencerStore';
import { usePadSettingsStore, computePlaybackRate } from '../store/padSettingsStore';
import { audioBufferToWav } from '../utils/wavEncoder';
import type { Sample } from '../utils/audioSlicer';

const LOOKAHEAD = 0.12;
const SCHED_INTERVAL = 25;

function scheduleClick(ctx: AudioContext, time: number, down: boolean) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.frequency.value = down ? 1200 : 800;
  g.gain.setValueAtTime(0.2, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.start(time); osc.stop(time + 0.05);
}

export function useSequencer(samples: Sample[]) {
  const store = useSequencerStore();
  const { getSettings } = usePadSettingsStore();

  const ctxRef   = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef   = useRef<number>();
  const schedRef = useRef(0);
  const nextRef  = useRef(0);
  const dispRef  = useRef(-1);
  const startRef = useRef(0);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed')
      ctxRef.current = new AudioContext({ latencyHint: 'interactive' });
    return ctxRef.current;
  }, []);

  const scheduleStep = useCallback((step: number, time: number) => {
    const ctx = getCtx();
    const st  = useSequencerStore.getState();
    st.steps.forEach((track, pi) => {
      if (!track[step]) return;
      const s = samples[pi]; if (!s) return;
      const id = `bank0-pad${pi}`, cfg = getSettings(id);
      const rate = computePlaybackRate(cfg);
      const { attack, decay, sustain, release } = cfg;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(1, time + attack);
      g.gain.linearRampToValueAtTime(sustain, time + attack + decay);
      const relStart = Math.max(time + attack + decay, time + (s.durationMs/1000)/rate - release);
      g.gain.setValueAtTime(sustain, relStart);
      g.gain.linearRampToValueAtTime(0, relStart + release);
      g.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = s.audioBuffer; src.playbackRate.value = rate;
      src.connect(g); src.start(time);
    });
    if (st.metronomeOn && step % 4 === 0) scheduleClick(ctx, time, step % 16 === 0);
  }, [getCtx, getSettings, samples]);

  const runScheduler = useCallback(() => {
    const ctx = getCtx();
    const st  = useSequencerStore.getState();
    const total = st.bars * 16, dur = 60 / (st.bpm * 4);
    while (nextRef.current < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(schedRef.current, nextRef.current);
      dispRef.current = schedRef.current;
      schedRef.current = (schedRef.current + 1) % total;
      nextRef.current += dur;
    }
  }, [getCtx, scheduleStep]);

  const rafLoop = useCallback(() => {
    useSequencerStore.getState().setCurrentStep(dispRef.current);
    rafRef.current = requestAnimationFrame(rafLoop);
  }, []);

  const play = useCallback((recording = false) => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    schedRef.current = 0; dispRef.current = 0;
    nextRef.current = ctx.currentTime + 0.05;
    startRef.current = nextRef.current;
    store.setTransportState(recording ? 'recording' : 'playing');
    store.setCurrentStep(0);
    timerRef.current = setInterval(runScheduler, SCHED_INTERVAL);
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [getCtx, store, runScheduler, rafLoop]);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rafRef.current)   cancelAnimationFrame(rafRef.current);
    store.setTransportState('stopped'); store.setCurrentStep(-1); dispRef.current = -1;
  }, [store]);

  const recordPadHit = useCallback((pi: number) => {
    const st = useSequencerStore.getState();
    if (st.transportState !== 'recording') return;
    const ctx = getCtx(), dur = 60 / (st.bpm * 4), total = st.bars * 16;
    const elapsed = ctx.currentTime - startRef.current;
    let step = st.quantize ? Math.round(elapsed / dur) : Math.floor(elapsed / dur);
    step = ((step % total) + total) % total;
    store.setStep(pi, step, true);
  }, [getCtx, store]);

  const triggerNow = useCallback((pi: number) => {
    const s = samples[pi]; if (!s) return;
    const ctx = getCtx(); if (ctx.state === 'suspended') ctx.resume();
    const id = `bank0-pad${pi}`, cfg = getSettings(id);
    const rate = computePlaybackRate(cfg), t0 = ctx.currentTime;
    const { attack, decay, sustain, release } = cfg;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + attack);
    g.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
    const relStart = Math.max(t0 + attack + decay, t0 + (s.durationMs/1000)/rate - release);
    g.gain.setValueAtTime(sustain, relStart); g.gain.linearRampToValueAtTime(0, relStart + release);
    g.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = s.audioBuffer; src.playbackRate.value = rate;
    src.connect(g); src.start(t0);
  }, [getCtx, getSettings, samples]);

  const exportWav = useCallback(async (): Promise<Blob> => {
    const st = useSequencerStore.getState();
    const total = st.bars * 16, stepDur = 60 / (st.bpm * 4);
    const totalSec = total * stepDur + 3;
    const offCtx = new OfflineAudioContext(2, Math.ceil(totalSec * 44100), 44100);
    st.steps.forEach((track, pi) => {
      const s = samples[pi]; if (!s) return;
      const id = `bank0-pad${pi}`, cfg = getSettings(id);
      const rate = computePlaybackRate(cfg);
      const { attack, decay, sustain, release } = cfg;
      track.forEach((active, si) => {
        if (!active) return;
        const t0 = si * stepDur;
        const g = offCtx.createGain();
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + attack);
        g.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
        const relStart = Math.max(t0 + attack + decay, t0 + (s.durationMs/1000)/rate - release);
        g.gain.setValueAtTime(sustain, relStart); g.gain.linearRampToValueAtTime(0, relStart + release);
        g.connect(offCtx.destination);
        const src = offCtx.createBufferSource();
        src.buffer = s.audioBuffer; src.playbackRate.value = rate;
        src.connect(g); src.start(t0);
      });
    });
    const rendered = await offCtx.startRendering();
    return audioBufferToWav(rendered);
  }, [getSettings, samples]);

  useEffect(() => () => { stop(); ctxRef.current?.close(); }, [stop]);

  return { play, stop, recordPadHit, triggerNow, exportWav };
}
