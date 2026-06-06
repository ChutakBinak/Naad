import { create } from 'zustand';

export interface PadSettings {
  /** Semitone shift: -24 to +24. Affects playbackRate via 2^(n/12). */
  pitch: number;
  /** Playback speed multiplier: 0.25 to 4.0. */
  speed: number;
  /** Attack time in seconds: 0.001 to 2.0. */
  attack: number;
  /** Decay time in seconds: 0.001 to 2.0. */
  decay: number;
  /** Sustain level: 0.0 to 1.0. */
  sustain: number;
  /** Release time in seconds: 0.001 to 4.0. */
  release: number;
}

export const DEFAULT_SETTINGS: PadSettings = {
  pitch:   0,
  speed:   1.0,
  attack:  0.005,
  decay:   0.08,
  sustain: 0.85,
  release: 0.12,
};

/** Compute the combined playbackRate from pitch + speed settings. */
export function computePlaybackRate(s: PadSettings): number {
  return s.speed * Math.pow(2, s.pitch / 12);
}

export interface PresetFile {
  version: '1';
  pads: Record<string, PadSettings>;
}

interface PadSettingsStore {
  settings: Map<string, PadSettings>;

  getSettings:    (padId: string) => PadSettings;
  updateSettings: (padId: string, patch: Partial<PadSettings>) => void;
  resetSettings:  (padId: string) => void;
  clearAll:       () => void;

  /** Export all pad settings to a JSON Blob. */
  exportPreset: () => Blob;
  /** Import settings from a parsed preset file. */
  importPreset: (preset: PresetFile) => void;
}

export const usePadSettingsStore = create<PadSettingsStore>((set, get) => ({
  settings: new Map(),

  getSettings: (padId) =>
    get().settings.get(padId) ?? { ...DEFAULT_SETTINGS },

  updateSettings: (padId, patch) =>
    set((s) => {
      const next = new Map(s.settings);
      const current = next.get(padId) ?? { ...DEFAULT_SETTINGS };
      next.set(padId, { ...current, ...patch });
      return { settings: next };
    }),

  resetSettings: (padId) =>
    set((s) => {
      const next = new Map(s.settings);
      next.set(padId, { ...DEFAULT_SETTINGS });
      return { settings: next };
    }),

  clearAll: () => set({ settings: new Map() }),

  exportPreset: () => {
    const pads: Record<string, PadSettings> = {};
    get().settings.forEach((v, k) => { pads[k] = v; });
    const preset: PresetFile = { version: '1', pads };
    return new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  },

  importPreset: (preset) => {
    const next = new Map<string, PadSettings>();
    Object.entries(preset.pads).forEach(([k, v]) => next.set(k, { ...DEFAULT_SETTINGS, ...v }));
    set({ settings: next });
  },
}));
