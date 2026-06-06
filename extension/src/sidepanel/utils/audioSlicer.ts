import type { CuePoint } from '../types';
import { audioBufferToWav } from './wavEncoder';

export interface Sample {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  audioBuffer: AudioBuffer;
  blob: Blob;
  url: string;
  label: string;
  timeRange: string;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export async function sliceAudio(
  blob: Blob,
  cuePoints: CuePoint[],
  onProgress?: (pct: number) => void,
): Promise<Sample[]> {
  onProgress?.(5);

  const ctx = new AudioContext();
  const buf = await blob.arrayBuffer();
  onProgress?.(20);

  const source = await ctx.decodeAudioData(buf);
  onProgress?.(40);

  const totalMs = source.duration * 1000;
  const boundaries = [
    0,
    ...cuePoints.map((c) => c.timestamp).filter((t) => t > 0 && t < totalMs),
    totalMs,
  ];

  const samples: Sample[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i];
    const endMs   = boundaries[i + 1];
    const { sampleRate, numberOfChannels } = source;
    const startFrame = Math.floor((startMs / 1000) * sampleRate);
    const endFrame   = Math.min(Math.floor((endMs / 1000) * sampleRate), source.length);
    const len        = Math.max(1, endFrame - startFrame);

    const slice = ctx.createBuffer(numberOfChannels, len, sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      slice.getChannelData(ch).set(source.getChannelData(ch).subarray(startFrame, endFrame));
    }

    const wavBlob = audioBufferToWav(slice);
    const url     = URL.createObjectURL(wavBlob);

    samples.push({
      id:          `s-${i + 1}-${Date.now()}`,
      index:       i + 1,
      startMs,
      endMs,
      durationMs:  endMs - startMs,
      audioBuffer: slice,
      blob:        wavBlob,
      url,
      label:       `Sample ${i + 1}`,
      timeRange:   `${fmt(startMs)} → ${fmt(endMs)}`,
    });

    onProgress?.(40 + Math.round((i + 1) / (boundaries.length - 1) * 55));
  }

  await ctx.close();
  onProgress?.(100);
  return samples;
}
