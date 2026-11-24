// Turns raw microphone PCM into a standard 16 kHz mono 16-bit PCM WAV.

const TARGET_RATE = 16000;
const HEADER_BYTES = 44;

/** Builds a 44-byte RIFF/WAVE header followed by little-endian PCM samples. */
export function encodeWav16kMono(samples: Float32Array, sampleRate = TARGET_RATE): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = HEADER_BYTES;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

/** Fast linear resampling from the native mic rate (e.g. 48 kHz) to 16 kHz. */
export function resampleLinearTo16k(samples: Float32Array, inputRate: number): Float32Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0) return samples;
  const ratio = TARGET_RATE / inputRate;
  const out = new Float32Array(Math.max(1, Math.round(samples.length * ratio)));
  for (let i = 0; i < out.length; i += 1) {
    const pos = i / ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const a = samples[left] ?? 0;
    const b = samples[right] ?? 0;
    out[i] = a + (b - a) * (pos - left);
  }
  return out;
}

/** Averages every captured channel into one mono stream. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}
