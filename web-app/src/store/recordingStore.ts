import { create } from 'zustand';
import { formatTime } from '../utils/time';
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
  setAudioBlob: (blob: Blob, mimeType: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  state: 'idle' as RecordingState,
  elapsed: 0,
  cuePoints: [] as CuePoint[],
  audioBlob: null as Blob | null,
  audioUrl: null as string | null,
  error: null as string | null,
};

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  ...initialState,

  setState: (state) => set({ state }),

  setElapsed: (elapsed) => set({ elapsed }),

  addCue: (timestamp) => {
    const label = formatTime(timestamp);
    set((s) => ({
      cuePoints: [...s.cuePoints, { timestamp, label }],
    }));
  },

  setAudioBlob: (blob, _mimeType) => {
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(blob);
    set({ audioBlob: blob, audioUrl: url });
  },

  setError: (error) => set({ error }),

  reset: () => {
    const prev = get().audioUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ ...initialState });
  },
}));
