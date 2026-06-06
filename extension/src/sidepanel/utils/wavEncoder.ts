/** Encodes an AudioBuffer to a 16-bit PCM WAV Blob. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels    = buffer.numberOfChannels;
  const sampleRate     = buffer.sampleRate;
  const numSamples     = buffer.length;
  const bytesPerSample = 2;
  const blockAlign     = numChannels * bytesPerSample;
  const dataSize       = numSamples * blockAlign;
  const wavBuffer      = new ArrayBuffer(44 + dataSize);
  const view           = new DataView(wavBuffer);

  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  ws(0,  'RIFF'); view.setUint32(4, 36 + dataSize, true);
  ws(8,  'WAVE'); ws(12, 'fmt ');
  view.setUint32(16, 16,  true);
  view.setUint16(20, 1,   true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate,  true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16,  true);
  ws(36, 'data'); view.setUint32(40, dataSize, true);

  const chData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) chData.push(buffer.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, chData[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}
