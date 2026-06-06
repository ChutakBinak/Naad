import { useRef, useCallback, useEffect } from 'react';
import { useSequencerStore } from '../store/sequencerStore';
import { usePadSettingsStore, computePlaybackRate } from '../store/padSettingsStore';
import { audioBufferToWav } from '../utils/wavEncoder';
import type { Sample } from '../types';

/** Look-ahead window in seconds — schedule this far into the future. */
const LOOKAHEAD      = 0.12;
/** How often the JS scheduler fires (ms). */
const SCHED_INTERVAL = 25;

function scheduleClick(ctx: AudioContext, time: number, isDownbeat: boolean) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = isDownbeat ? 1200 : 800;
  gain.gain.setValueAtTime(0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.start(time);
  osc.stop(time + 0.05);
}

export function useSequencer(samples: Sample[]) {
  const store           = useSequencerStore();
  const { getSettings } = usePadSettingsStore();

  const ctxRef            = useRef<AudioContext | null>(null);
  const schedulerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef            = useRef<number>();
  /** Next step to be scheduled (scheduler thread). */
  const schedStepRef      = useRef(0);
  /** Audio time of the next step to schedule. */
  const nextTimeRef       = useRef(0);
  /** Step currently "at" in the audio timeline — for UI. */
  const displayStepRef    = useRef(-1);
  /** Audio-context time when the transport started. */
  const startTimeRef      = useRef(0);

  // ── AudioContext ──────────────────────────────────────────────────────────
  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext({ latencyHint: 'interactive' });
    }
    return ctxRef.current;
  }, []);

  // ── Schedule one step ─────────────────────────────────────────────────────
  const scheduleStep = useCallback(
    (stepIndex: number, time: number) => {
      const ctx   = getCtx();
      const state = useSequencerStore.getState();

      state.steps.forEach((track, padIndex) => {
        if (!track[stepIndex]) return;
        const sample = samples[padIndex];
        if (!sample) return;

        const padId   = `bank0-pad${padIndex}`;
        const cfg     = getSettings(padId);
        const rate    = computePlaybackRate(cfg);
        const { attack, decay, sustain, release } = cfg;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(1, time + attack);
        gainNode.gain.linearRampToValueAtTime(sustain, time + attack + decay);

        const adjDur      = (sample.durationMs / 1000) / rate;
        const relStart    = Math.max(time + attack + decay, time + adjDur - release);
        gainNode.gain.setValueAtTime(sustain, relStart);
        gainNode.gain.linearRampToValueAtTime(0, relStart + release);
        gainNode.connect(ctx.destination);

        const src = ctx.createBufferSource();
        src.buffer             = sample.audioBuffer;
        src.playbackRate.value = rate;
        src.connect(gainNode);
        src.start(time);
      });

      // Metronome: click on every quarter note (every 4 steps)
      if (state.metronomeOn && stepIndex % 4 === 0) {
        scheduleClick(ctx, time, stepIndex % 16 === 0);
      }
    },
    [getCtx, getSettings, samples],
  );

  // ── Core scheduler loop ───────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx   = getCtx();
    const state = useSequencerStore.getState();
    const total = state.bars * 16;
    const dur   = 60 / (state.bpm * 4);

    while (nextTimeRef.current < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(schedStepRef.current, nextTimeRef.current);
      displayStepRef.current = schedStepRef.current;

      schedStepRef.current = (schedStepRef.current + 1) % total;
      nextTimeRef.current  += dur;

      // If not looping, stop after one pass
      if (!state.isLooping && schedStepRef.current === 0) {
        // Let the final scheduled audio play out, then auto-stop
        const stopDelay = (nextTimeRef.current - ctx.currentTime) * 1000 + 100;
        setTimeout(() => useSequencer_stop(), stopDelay);
        return;
      }
    }
  }, [getCtx, scheduleStep]);

  // ── RAF: push displayStep → store (for UI highlight) ─────────────────────
  const rafLoop = useCallback(() => {
    useSequencerStore.getState().setCurrentStep(displayStepRef.current);
    rafRef.current = requestAnimationFrame(rafLoop);
  }, []);

  // ── Transport: play ───────────────────────────────────────────────────────
  const play = useCallback(
    (recording = false) => {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();

      schedStepRef.current   = 0;
      displayStepRef.current = 0;
      nextTimeRef.current    = ctx.currentTime + 0.05;
      startTimeRef.current   = nextTimeRef.current;

      store.setTransportState(recording ? 'recording' : 'playing');
      store.setCurrentStep(0);

      schedulerTimerRef.current = setInterval(runScheduler, SCHED_INTERVAL);
      rafRef.current = requestAnimationFrame(rafLoop);
    },
    [getCtx, store, runScheduler, rafLoop],
  );

  // ── Transport: stop ───────────────────────────────────────────────────────
  // Defined with plain function so it can be referenced in the non-looping auto-stop above.
  let useSequencer_stop: () => void;
  const stop = useCallback(() => {
    if (schedulerTimerRef.current) {
      clearInterval(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    store.setTransportState('stopped');
    store.setCurrentStep(-1);
    displayStepRef.current = -1;
  }, [store]);
  useSequencer_stop = stop;

  // ── Record: quantize pad hit → step grid ─────────────────────────────────
  const recordPadHit = useCallback(
    (padIndex: number) => {
      const state = useSequencerStore.getState();
      if (state.transportState !== 'recording') return;

      const ctx  = getCtx();
      const dur  = 60 / (state.bpm * 4);
      const total = state.bars * 16;

      // Elapsed time since the loop start
      const elapsed = ctx.currentTime - startTimeRef.current;
      const rawStep = elapsed / dur;

      let step: number;
      if (state.quantize) {
        step = Math.round(rawStep) % total;
      } else {
        step = Math.floor(rawStep) % total;
      }
      step = ((step % total) + total) % total;

      store.setStep(padIndex, step, true);
    },
    [getCtx, store],
  );

  // ── Trigger sample immediately (for live recording feel) ──────────────────
  const triggerNow = useCallback(
    (padIndex: number) => {
      const sample = samples[padIndex];
      if (!sample) return;
      const ctx   = getCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const padId = `bank0-pad${padIndex}`;
      const cfg   = getSettings(padId);
      const rate  = computePlaybackRate(cfg);
      const { attack, decay, sustain, release } = cfg;
      const t0    = ctx.currentTime;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1, t0 + attack);
      gain.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
      const relStart = Math.max(t0 + attack + decay, t0 + (sample.durationMs / 1000) / rate - release);
      gain.gain.setValueAtTime(sustain, relStart);
      gain.gain.linearRampToValueAtTime(0, relStart + release);
      gain.connect(ctx.destination);

      const src = ctx.createBufferSource();
      src.buffer             = sample.audioBuffer;
      src.playbackRate.value = rate;
      src.connect(gain);
      src.start(t0);
    },
    [getCtx, getSettings, samples],
  );

  // ── WAV export via OfflineAudioContext ────────────────────────────────────
  const exportWav = useCallback(async (): Promise<Blob> => {
    const state     = useSequencerStore.getState();
    const totalSteps = state.bars * 16;
    const stepDur   = 60 / (state.bpm * 4);
    const tailTime  = 3.0;
    const totalSec  = totalSteps * stepDur + tailTime;
    const SR        = 44100;

    const offCtx = new OfflineAudioContext(2, Math.ceil(totalSec * SR), SR);

    state.steps.forEach((track, padIndex) => {
      const sample = samples[padIndex];
      if (!sample) return;

      const padId = `bank0-pad${padIndex}`;
      const cfg   = getSettings(padId);
      const rate  = computePlaybackRate(cfg);
      const { attack, decay, sustain, release } = cfg;

      track.forEach((active, stepIndex) => {
        if (!active) return;
        const t0  = stepIndex * stepDur;
        const adj = (sample.durationMs / 1000) / rate;

        const gain = offCtx.createGain();
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(1, t0 + attack);
        gain.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
        const relStart = Math.max(t0 + attack + decay, t0 + adj - release);
        gain.gain.setValueAtTime(sustain, relStart);
        gain.gain.linearRampToValueAtTime(0, relStart + release);
        gain.connect(offCtx.destination);

        const src = offCtx.createBufferSource();
        src.buffer             = sample.audioBuffer;
        src.playbackRate.value = rate;
        src.connect(gain);
        src.start(t0);
      });
    });

    const rendered = await offCtx.startRendering();
    return audioBufferToWav(rendered);
  }, [getSettings, samples]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stop();
      ctxRef.current?.close();
    };
  }, [stop]);

  return { play, stop, recordPadHit, triggerNow, exportWav };
}
