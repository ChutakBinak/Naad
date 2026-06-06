export interface CuePoint {
  /** Milliseconds elapsed from recording start */
  timestamp: number;
  /** Human-readable formatted time string */
  label: string;
}

export type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopped';

export interface ExportData {
  version: string;
  recordedAt: string;
  durationMs: number;
  cuePoints: Array<{ index: number; timestampMs: number; label: string }>;
}

/** Audio source type */
export type AudioSource = 'display' | 'file';

/** A single sliced audio sample */
export interface Sample {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Decoded PCM buffer — used for Phase 3 pad playback */
  audioBuffer: AudioBuffer;
  /** WAV blob — used for WaveSurfer rendering */
  blob: Blob;
  /** Object URL for the WAV blob */
  url: string;
  label: string;
  /** e.g. "00:10.00 → 00:15.00" */
  timeRange: string;
}
