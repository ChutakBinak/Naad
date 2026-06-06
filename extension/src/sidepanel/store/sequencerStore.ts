import { create } from 'zustand';

export type TransportState = 'stopped' | 'playing' | 'recording';

export interface ProjectData { version: '1'; bpm: number; bars: number; steps: boolean[][]; }

function makeSteps(bars: number): boolean[][] {
  return Array.from({ length: 9 }, () => Array(bars * 16).fill(false));
}

interface SequencerStore {
  bpm: number; bars: number; isLooping: boolean; metronomeOn: boolean; quantize: boolean;
  transportState: TransportState; currentStep: number; steps: boolean[][];

  setBpm: (v: number) => void; setBars: (v: number) => void;
  setLooping: (v: boolean) => void; setMetronome: (v: boolean) => void; setQuantize: (v: boolean) => void;
  setTransportState: (s: TransportState) => void; setCurrentStep: (n: number) => void;
  toggleStep: (p: number, s: number) => void;
  setStep: (p: number, s: number, a: boolean) => void;
  clearAll: () => void;
  exportProject: () => Blob;
  importProject: (d: ProjectData) => void;
}

export const useSequencerStore = create<SequencerStore>((set, get) => ({
  bpm: 120, bars: 1, isLooping: true, metronomeOn: false, quantize: true,
  transportState: 'stopped', currentStep: -1, steps: makeSteps(1),

  setBpm: (v) => set({ bpm: Math.max(20, Math.min(300, v)) }),

  setBars: (bars) => set((s) => {
    const oldTotal = s.bars * 16, newTotal = bars * 16;
    const steps = s.steps.map((t) =>
      newTotal > oldTotal ? [...t, ...Array<boolean>(newTotal - oldTotal).fill(false)] : t.slice(0, newTotal));
    return { bars, steps };
  }),

  setLooping: (v) => set({ isLooping: v }), setMetronome: (v) => set({ metronomeOn: v }),
  setQuantize: (v) => set({ quantize: v }), setTransportState: (s) => set({ transportState: s }),
  setCurrentStep: (n) => set({ currentStep: n }),

  toggleStep: (p, s) => set((st) => {
    const next = st.steps.map((t) => [...t]);
    next[p][s] = !next[p][s];
    return { steps: next };
  }),

  setStep: (p, s, a) => set((st) => {
    const next = st.steps.map((t) => [...t]);
    if (s >= 0 && s < next[p].length) next[p][s] = a;
    return { steps: next };
  }),

  clearAll: () => set((s) => ({ steps: makeSteps(s.bars) })),

  exportProject: () => {
    const { bpm, bars, steps } = get();
    return new Blob([JSON.stringify({ version: '1', bpm, bars, steps }, null, 2)], { type: 'application/json' });
  },

  importProject: (d) => set({ bpm: d.bpm, bars: d.bars, steps: d.steps }),
}));
