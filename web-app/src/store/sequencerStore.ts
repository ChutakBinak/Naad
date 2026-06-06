import { create } from 'zustand';

export type TransportState = 'stopped' | 'playing' | 'recording';

export interface ProjectData {
  version: '1';
  bpm: number;
  bars: number;
  steps: boolean[][];
}

const TRACKS = 9;

function makeSteps(bars: number): boolean[][] {
  return Array.from({ length: TRACKS }, () => Array(bars * 16).fill(false));
}

interface SequencerStore {
  bpm:            number;
  bars:           number;
  isLooping:      boolean;
  metronomeOn:    boolean;
  quantize:       boolean;
  transportState: TransportState;
  /** Current step index displayed as the playhead (−1 = stopped). */
  currentStep:    number;
  /** steps[padIndex][stepIndex] */
  steps:          boolean[][];

  setBpm:            (bpm: number) => void;
  setBars:           (bars: number) => void;
  setLooping:        (v: boolean) => void;
  setMetronome:      (v: boolean) => void;
  setQuantize:       (v: boolean) => void;
  setTransportState: (s: TransportState) => void;
  setCurrentStep:    (step: number) => void;

  toggleStep:  (padIndex: number, stepIndex: number) => void;
  setStep:     (padIndex: number, stepIndex: number, active: boolean) => void;
  clearTrack:  (padIndex: number) => void;
  clearAll:    () => void;

  exportProject: () => Blob;
  importProject: (data: ProjectData) => void;
}

export const useSequencerStore = create<SequencerStore>((set, get) => ({
  bpm:            120,
  bars:           2,
  isLooping:      true,
  metronomeOn:    false,
  quantize:       true,
  transportState: 'stopped',
  currentStep:    -1,
  steps:          makeSteps(2),

  setBpm: (bpm) => set({ bpm: Math.max(20, Math.min(300, bpm)) }),

  setBars: (bars) =>
    set((s) => {
      const oldTotal = s.bars * 16;
      const newTotal = bars * 16;
      const newSteps = s.steps.map((track) => {
        if (newTotal > oldTotal) {
          return [...track, ...Array<boolean>(newTotal - oldTotal).fill(false)];
        }
        return track.slice(0, newTotal);
      });
      return { bars, steps: newSteps };
    }),

  setLooping:        (v) => set({ isLooping: v }),
  setMetronome:      (v) => set({ metronomeOn: v }),
  setQuantize:       (v) => set({ quantize: v }),
  setTransportState: (s) => set({ transportState: s }),
  setCurrentStep:    (step) => set({ currentStep: step }),

  toggleStep: (padIndex, stepIndex) =>
    set((s) => {
      const next = s.steps.map((t) => [...t]);
      next[padIndex][stepIndex] = !next[padIndex][stepIndex];
      return { steps: next };
    }),

  setStep: (padIndex, stepIndex, active) =>
    set((s) => {
      const next = s.steps.map((t) => [...t]);
      if (stepIndex >= 0 && stepIndex < next[padIndex].length) {
        next[padIndex][stepIndex] = active;
      }
      return { steps: next };
    }),

  clearTrack: (padIndex) =>
    set((s) => {
      const next = s.steps.map((t) => [...t]);
      next[padIndex] = next[padIndex].map(() => false);
      return { steps: next };
    }),

  clearAll: () =>
    set((s) => ({ steps: makeSteps(s.bars) })),

  exportProject: () => {
    const { bpm, bars, steps } = get();
    const data: ProjectData = { version: '1', bpm, bars, steps };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  },

  importProject: (data) =>
    set({
      bpm:   data.bpm,
      bars:  data.bars,
      steps: data.steps,
    }),
}));
