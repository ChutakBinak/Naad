import { create } from 'zustand';

export type LoopMode = 'off' | 'forward' | 'reverse' | 'ping-pong';

export interface PadSettings {
  pitch:      number;   // -24 to +24 semitones
  speed:      number;   // 0.25 to 4.0
  attack:     number;   // seconds
  decay:      number;   // seconds
  sustain:    number;   // 0 to 1
  release:    number;   // seconds
  startRatio: number;   // 0.0–1.0 sample start point
  endRatio:   number;   // 0.0–1.0 sample end point
  loopMode:   LoopMode;
}

export const DEFAULT_SETTINGS: PadSettings = {
  pitch: 0, speed: 1.0, attack: 0.005, decay: 0.08, sustain: 0.85, release: 0.12,
  startRatio: 0, endRatio: 1, loopMode: 'off',
};

export function computePlaybackRate(s: PadSettings): number {
  return s.speed * Math.pow(2, s.pitch / 12);
}

export interface PresetFile {
  version: '1';
  pads: Record<string, PadSettings>;
}

interface PadSettingsStore {
  settings: Map<string, PadSettings>;
  getSettings:    (id: string) => PadSettings;
  updateSettings: (id: string, patch: Partial<PadSettings>) => void;
  resetSettings:  (id: string) => void;
  clearAll:       () => void;
  exportPreset:   () => Blob;
  importPreset:   (p: PresetFile) => void;
}

export const usePadSettingsStore = create<PadSettingsStore>((set, get) => ({
  settings: new Map(),

  getSettings: (id) => get().settings.get(id) ?? { ...DEFAULT_SETTINGS },

  updateSettings: (id, patch) => set((s) => {
    const m = new Map(s.settings);
    m.set(id, { ...(m.get(id) ?? DEFAULT_SETTINGS), ...patch });
    return { settings: m };
  }),

  resetSettings: (id) => set((s) => {
    const m = new Map(s.settings);
    m.set(id, { ...DEFAULT_SETTINGS });
    return { settings: m };
  }),

  clearAll: () => set({ settings: new Map() }),

  exportPreset: () => {
    const pads: Record<string, PadSettings> = {};
    get().settings.forEach((v, k) => { pads[k] = v; });
    return new Blob([JSON.stringify({ version: '1', pads }, null, 2)], { type: 'application/json' });
  },

  importPreset: (p) => {
    const m = new Map<string, PadSettings>();
    Object.entries(p.pads).forEach(([k, v]) => m.set(k, { ...DEFAULT_SETTINGS, ...v }));
    set({ settings: m });
  },
}));
