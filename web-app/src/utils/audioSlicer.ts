import type { Sample } from '../types';
import { audioBufferToWav } from './wavEncoder';
import { formatTime } from './time';

export interface SliceResult {
  samples: Sample[];
  /** The full decoded AudioBuffer — kept alive for Phase 3 pad playback */
  sourceBuffer: AudioBuffer;
}

/**
 * Decodes an audio Blob, then slices it into Sample objects using
 * the provided cue timestamps.
 *
 * Boundary logic:
 *   [0ms, cue1, cue2, ..., cueN, audioDuration]
 *
 * Produces N+1 samples (one between each adjacent pair of boundaries).
 */
export async function sliceAudio(
  blob: Blob,
  cueTimestamps: number[],
  onProgress?: (pct: number) => void,
): Promise<SliceResult> {
  onProgress?.(5);

  // ── 1. Decode ─────────────────────────────────────────────────────────────
  const audioCtx    = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();

  onProgress?.(20);

  const sourceBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  onProgress?.(40);

  // ── 2. Build boundary list ────────────────────────────────────────────────
  const durationMs = sourceBuffer.duration * 1000;

  // Filter out cues beyond the actual audio length, deduplicate, and sort
  const validCues = [...new Set(cueTimestamps)]
    .filter((t) => t > 0 && t < durationMs)
    .sort((a, b) => a - b);

  const boundaries = [0, ...validCues, durationMs];

  // ── 3. Slice ──────────────────────────────────────────────────────────────
  const samples: Sample[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i];
    const endMs   = boundaries[i + 1];

    const sliceBuffer = extractSlice(sourceBuffer, startMs, endMs, audioCtx);
    const blob        = audioBufferToWav(sliceBuffer);
    const url         = URL.createObjectURL(blob);

    samples.push({
      id:          `sample-${i + 1}-${Date.now()}`,
      index:       i + 1,
      startMs,
      endMs,
      durationMs:  endMs - startMs,
      audioBuffer: sliceBuffer,
      blob,
      url,
      label:       `Sample ${i + 1}`,
      timeRange:   `${formatTime(startMs)} → ${formatTime(endMs)}`,
    });

    onProgress?.(40 + Math.round((i + 1) / (boundaries.length - 1) * 55));
  }

  // Keep the AudioContext alive — it holds references WaveSurfer may need.
  // It will be GC'd when all AudioBuffers derived from it are released.
  // (In Phase 3 we will reuse it for pad playback.)
  await audioCtx.close();

  onProgress?.(100);

  return { samples, sourceBuffer };
}

/**
 * Copies the frames [startMs, endMs) from source into a new AudioBuffer.
 */
function extractSlice(
  source: AudioBuffer,
  startMs: number,
  endMs: number,
  ctx: AudioContext,
): AudioBuffer {
  const { sampleRate, numberOfChannels } = source;

  const startFrame = Math.floor((startMs / 1000) * sampleRate);
  const endFrame   = Math.min(
    Math.floor((endMs / 1000) * sampleRate),
    source.length,
  );
  const frameCount = Math.max(1, endFrame - startFrame);

  const slice = ctx.createBuffer(numberOfChannels, frameCount, sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    slice
      .getChannelData(ch)
      .set(source.getChannelData(ch).subarray(startFrame, endFrame));
  }

  return slice;
}
