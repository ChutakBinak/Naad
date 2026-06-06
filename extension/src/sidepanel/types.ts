export interface CuePoint {
  /** Milliseconds elapsed from recording start */
  timestamp: number;
  /** Human-readable formatted time string */
  label: string;
}

export type RecordingState = 'idle' | 'recording' | 'stopped';

export interface RecordingSession {
  state: RecordingState;
  elapsed: number;
  cuePoints: CuePoint[];
  audioBlob: Blob | null;
  audioUrl: string | null;
}

export interface ExportData {
  version: string;
  recordedAt: string;
  durationMs: number;
  cuePoints: Array<{ index: number; timestampMs: number; label: string }>;
}
