/**
 * useDBPersistence
 *
 * Hydrates all Zustand stores from IndexedDB on mount, then subscribes to each
 * store and debounces writes back to the DB whenever state changes.
 *
 * Returns { isHydrating } — the App renders a loading overlay while true.
 */

import { useEffect, useRef, useState } from 'react';
import { useRecordingStore }   from '../store/recordingStore';
import { useSamplesStore }     from '../store/samplesStore';
import { usePadSettingsStore } from '../store/padSettingsStore';
import { useSequencerStore }   from '../store/sequencerStore';
import {
  saveRecording, loadRecording,
  saveSamples,   loadSamples,
  savePadSettings, loadPadSettings,
  saveProject,   loadProject,
} from '../db/operations';
import type { Sample }       from '../types';
import type { PadSettings }  from '../store/padSettingsStore';

// ── Utility: debounce ─────────────────────────────────────────────────────────

function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Utility: decode a WAV Blob into an AudioBuffer ────────────────────────────

async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDBPersistence(): { isHydrating: boolean } {
  const [isHydrating, setIsHydrating] = useState(true);
  const mountedRef = useRef(false);

  // ── One-time hydration on mount ───────────────────────────────────────────
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      try {
        // ── Samples (determines primary view) ────────────────────────────────
        const storedSamples = await loadSamples();
        if (storedSamples.length > 0) {
          const samples: Sample[] = await Promise.all(
            storedSamples.map(async (s) => ({
              id:          `sample-${s.index}-restored`,
              index:       s.index,
              startMs:     s.startMs,
              endMs:       s.endMs,
              durationMs:  s.durationMs,
              audioBuffer: await blobToAudioBuffer(s.blob),
              blob:        s.blob,
              url:         URL.createObjectURL(s.blob),
              label:       s.label,
              timeRange:   s.timeRange,
            }))
          );
          useSamplesStore.getState().setSamples(samples);
        } else {
          // ── Restore pre-slice recording if present ─────────────────────────
          const rec = await loadRecording();
          if (rec) {
            const rs = useRecordingStore.getState();
            rec.cueTimestamps.forEach((ts) => rs.addCue(ts));
            rs.setElapsed(rec.elapsed);
            rs.setAudioBlob(rec.blob, '');
            rs.setState('stopped');
          }
        }

        // ── Pad settings ─────────────────────────────────────────────────────
        const ps = await loadPadSettings();
        if (ps.length > 0) {
          const pads: Record<string, PadSettings> = {};
          ps.forEach(({ padId, settings }) => { pads[padId] = settings; });
          usePadSettingsStore.getState().importPreset({ version: '1', pads });
        }

        // ── Sequencer project ─────────────────────────────────────────────────
        const proj = await loadProject();
        if (proj) {
          const seq = useSequencerStore.getState();
          seq.importProject({ version: '1', bpm: proj.bpm, bars: proj.bars, steps: proj.steps });
          seq.setLooping(proj.isLooping);
          seq.setMetronome(proj.metronomeOn);
          seq.setQuantize(proj.quantize);
        }
      } catch (err) {
        console.warn('[naad] DB hydration error:', err);
      } finally {
        setIsHydrating(false);
      }
    })();
  }, []);

  // ── Auto-save: samples ────────────────────────────────────────────────────
  useEffect(() => {
    if (isHydrating) return;

    const flush = debounce((state: { samples: Sample[] }) => {
      saveSamples(
        state.samples.map((s, i) => ({
          order:      i,
          index:      s.index,
          startMs:    s.startMs,
          endMs:      s.endMs,
          durationMs: s.durationMs,
          blob:       s.blob,
          label:      s.label,
          timeRange:  s.timeRange,
        }))
      ).catch((e) => console.warn('[naad] sample save:', e));
    }, 400);

    return useSamplesStore.subscribe(flush);
  }, [isHydrating]);

  // ── Auto-save: recording (only when stopped and a blob exists) ────────────
  useEffect(() => {
    if (isHydrating) return;

    const flush = debounce((state: ReturnType<typeof useRecordingStore.getState>) => {
      if (state.state !== 'stopped' || !state.audioBlob) return;
      saveRecording({
        id:            'current',
        blob:          state.audioBlob,
        elapsed:       state.elapsed,
        cueTimestamps: state.cuePoints.map((c) => c.timestamp),
        savedAt:       Date.now(),
      }).catch((e) => console.warn('[naad] recording save:', e));
    }, 400);

    return useRecordingStore.subscribe(flush);
  }, [isHydrating]);

  // ── Auto-save: pad settings ───────────────────────────────────────────────
  useEffect(() => {
    if (isHydrating) return;

    const flush = debounce((state: ReturnType<typeof usePadSettingsStore.getState>) => {
      const rows = Array.from(state.settings.entries()).map(
        ([padId, settings]) => ({ padId, settings })
      );
      savePadSettings(rows).catch((e) => console.warn('[naad] padSettings save:', e));
    }, 400);

    return usePadSettingsStore.subscribe(flush);
  }, [isHydrating]);

  // ── Auto-save: sequencer project (only when transport is stopped) ─────────
  useEffect(() => {
    if (isHydrating) return;

    const flush = debounce((state: ReturnType<typeof useSequencerStore.getState>) => {
      if (state.transportState !== 'stopped') return;
      saveProject({
        id:          'current',
        bpm:         state.bpm,
        bars:        state.bars,
        steps:       state.steps,
        isLooping:   state.isLooping,
        metronomeOn: state.metronomeOn,
        quantize:    state.quantize,
      }).catch((e) => console.warn('[naad] project save:', e));
    }, 400);

    return useSequencerStore.subscribe(flush);
  }, [isHydrating]);

  return { isHydrating };
}
