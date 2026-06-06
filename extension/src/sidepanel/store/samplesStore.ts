import { create } from 'zustand';
import type { Sample } from '../utils/audioSlicer';

interface SamplesStore {
  samples: Sample[];
  isSlicing: boolean;
  sliceProgress: number;
  sliceError: string | null;

  setSamples: (s: Sample[]) => void;
  setSlicing: (v: boolean) => void;
  setSliceProgress: (pct: number) => void;
  setSliceError: (e: string | null) => void;
  clearSamples: () => void;
}

export const useSamplesStore = create<SamplesStore>((set, get) => ({
  samples:       [],
  isSlicing:     false,
  sliceProgress: 0,
  sliceError:    null,

  setSamples:       (samples) => set({ samples }),
  setSlicing:       (v) => set({ isSlicing: v }),
  setSliceProgress: (pct) => set({ sliceProgress: pct }),
  setSliceError:    (e) => set({ sliceError: e }),

  clearSamples: () => {
    get().samples.forEach((s) => URL.revokeObjectURL(s.url));
    set({ samples: [], isSlicing: false, sliceProgress: 0, sliceError: null });
  },
}));
