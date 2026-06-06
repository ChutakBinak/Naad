import { create } from 'zustand';
import type { CuePoint, RecordingState } from '../types';

interface RecordingStore {
  state: RecordingState;
  elapsed: number;
  cuePoints: CuePoint[];
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;

  setState: (state: RecordingState) => void;
  setElapsed: (elapsed: number) => void;
  addCue: (timestamp: number) => void;
  setAudioBlob: (blob: Blob) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  state: 'idle' as RecordingState,
  elapsed: 0,
  cuePoints: [],
  audioBlob: null,
  audioUrl: null,
  error: null,
};

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  ...initialState,

  setState: (state) => set({ state }),

  setElapsed: (elapsed) => set({ elapsed }),

  addCue: (timestamp) => {
    const totalSeconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centis = Math.floor((timestamp % 1000) / 10);
    const label = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;

    set((s) => ({
      cuePoints: [...s.cuePoints, { timestamp, label }],
    }));
  },

  setAudioBlob: (blob) => {
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(blob);
    set({ audioBlob: blob, audioUrl: url });
  },

  setError: (error) => set({ error }),

  reset: () => {
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    set(initialState);
  },
}));
