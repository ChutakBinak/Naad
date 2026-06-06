import { create } from 'zustand';

interface PadStore {
  /** Zero-indexed current bank */
  currentBank: number;
  /** Set of pad IDs currently playing */
  playingPads: Set<string>;

  setCurrentBank: (bank: number) => void;
  setPadPlaying: (id: string, playing: boolean) => void;
  clearAllPlaying: () => void;
}

export const usePadStore = create<PadStore>((set) => ({
  currentBank: 0,
  playingPads: new Set(),

  setCurrentBank: (bank) => set({ currentBank: bank }),

  setPadPlaying: (id, playing) =>
    set((s) => {
      const next = new Set(s.playingPads);
      playing ? next.add(id) : next.delete(id);
      return { playingPads: next };
    }),

  clearAllPlaying: () => set({ playingPads: new Set() }),
}));
