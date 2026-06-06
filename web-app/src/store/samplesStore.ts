import { create } from 'zustand';
import type { Sample } from '../types';

interface SamplesStore {
  samples: Sample[];
  isSlicing: boolean;
  sliceProgress: number;   // 0–100
  sliceError: string | null;

  setSamples: (samples: Sample[]) => void;
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

  setSamples: (samples) => set({ samples }),

  setSlicing: (v) => set({ isSlicing: v, sliceProgress: v ? 0 : get().sliceProgress }),

  setSliceProgress: (pct) => set({ sliceProgress: pct }),

  setSliceError: (e) => set({ sliceError: e }),

  clearSamples: () => {
    // Revoke all object URLs to avoid memory leaks
    get().samples.forEach((s) => URL.revokeObjectURL(s.url));
    set({ samples: [], isSlicing: false, sliceProgress: 0, sliceError: null });
  },
}));
