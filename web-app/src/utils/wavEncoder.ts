/**
 * Encodes an AudioBuffer to a 16-bit PCM WAV Blob.
 * Interleaves all channels (stereo → L/R interleaved).
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const numSamples  = buffer.length;
  const bitDepth    = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign  = numChannels * bytesPerSample;
  const dataSize    = numSamples * blockAlign;
  const wavBuffer   = new ArrayBuffer(44 + dataSize);
  const view        = new DataView(wavBuffer);

  // ── RIFF header ──────────────────────────────────────────────────────────
  writeString(view, 0,  'RIFF');
  view.setUint32(4,  36 + dataSize, true);   // file size – 8
  writeString(view, 8,  'WAVE');

  // ── fmt chunk ─────────────────────────────────────────────────────────────
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);              // chunk size (PCM = 16)
  view.setUint16(20, 1,  true);              // format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // ── data chunk ────────────────────────────────────────────────────────────
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // ── Interleaved samples ───────────────────────────────────────────────────
  // Pre-fetch all channel data arrays for speed
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
