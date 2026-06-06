/**
 * useDBPersistence (extension)
 *
 * Persists samples, pad settings, and the sequencer project across side-panel
 * open/close cycles.  Recording blobs are intentionally excluded — they are
 * tied to the live MediaStream and become useless after the stream closes.
 */

import { useEffect, useRef, useState } from 'react';
import { useSamplesStore }     from '../store/samplesStore';
import { usePadSettingsStore } from '../store/padSettingsStore';
import { useSequencerStore }   from '../store/sequencerStore';
import {
  saveSamples,   loadSamples,
  savePadSettings, loadPadSettings,
  saveProject,   loadProject,
} from '../db/operations';
import type { Sample }      from '../utils/audioSlicer';
import type { PadSettings } from '../store/padSettingsStore';

function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

export function useDBPersistence(): { isHydrating: boolean } {
  const [isHydrating, setIsHydrating] = useState(true);
  const mountedRef = useRef(false);

  // ── Hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    void (async () => {
      try {
        // Samples
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
        }

        // Pad settings
        const ps = await loadPadSettings();
        if (ps.length > 0) {
          const pads: Record<string, PadSettings> = {};
          ps.forEach(({ padId, settings }) => { pads[padId] = settings; });
          usePadSettingsStore.getState().importPreset({ version: '1', pads });
        }

        // Sequencer project
        const proj = await loadProject();
        if (proj) {
          const seq = useSequencerStore.getState();
          seq.importProject({ version: '1', bpm: proj.bpm, bars: proj.bars, steps: proj.steps });
          seq.setLooping(proj.isLooping);
          seq.setMetronome(proj.metronomeOn);
          seq.setQuantize(proj.quantize);
        }
      } catch (err) {
        console.warn('[naad-ext] DB hydration error:', err);
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
          order: i, index: s.index, startMs: s.startMs, endMs: s.endMs,
          durationMs: s.durationMs, blob: s.blob, label: s.label, timeRange: s.timeRange,
        }))
      ).catch((e) => console.warn('[naad-ext] sample save:', e));
    }, 400);
    return useSamplesStore.subscribe(flush);
  }, [isHydrating]);

  // ── Auto-save: pad settings ───────────────────────────────────────────────
  useEffect(() => {
    if (isHydrating) return;
    const flush = debounce((state: ReturnType<typeof usePadSettingsStore.getState>) => {
      const rows = Array.from(state.settings.entries()).map(
        ([padId, settings]) => ({ padId, settings })
      );
      savePadSettings(rows).catch((e) => console.warn('[naad-ext] padSettings save:', e));
    }, 400);
    return usePadSettingsStore.subscribe(flush);
  }, [isHydrating]);

  // ── Auto-save: sequencer project ──────────────────────────────────────────
  useEffect(() => {
    if (isHydrating) return;
    const flush = debounce((state: ReturnType<typeof useSequencerStore.getState>) => {
      if (state.transportState !== 'stopped') return;
      saveProject({
        id: 'current', bpm: state.bpm, bars: state.bars, steps: state.steps,
        isLooping: state.isLooping, metronomeOn: state.metronomeOn, quantize: state.quantize,
      }).catch((e) => console.warn('[naad-ext] project save:', e));
    }, 400);
    return useSequencerStore.subscribe(flush);
  }, [isHydrating]);

  return { isHydrating };
}
