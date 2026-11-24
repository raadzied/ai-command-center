// STEP 80 — WAV header bytes, linear resampling, and voice-path guardrails.

import { readFileSync } from 'node:fs';
import {
  encodeWav16kMono,
  mixToMono,
  resampleLinearTo16k,
} from '../src/electron/renderer/src/hud/bridge/wav-encode.js';
import { check, finish } from './test-db-helpers.js';

function ascii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

function main(): void {
  console.log('=== STEP 80 — WAV Encoding Test ===\n');

  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encodeWav16kMono(samples);
  const view = new DataView(wav);
  check('buffer is 44-byte header plus 2 bytes per sample', wav.byteLength === 54);
  check('RIFF / WAVE / fmt / data markers',
    ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WAVE'
    && ascii(view, 12, 4) === 'fmt ' && ascii(view, 36, 4) === 'data');
  check('RIFF size and data size are little-endian and consistent',
    view.getUint32(4, true) === 46 && view.getUint32(40, true) === 10);
  check('PCM format, mono, 16 kHz, 16-bit',
    view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1
    && view.getUint32(24, true) === 16000 && view.getUint16(34, true) === 16);
  check('byteRate=32000 and blockAlign=2',
    view.getUint32(28, true) === 32000 && view.getUint16(32, true) === 2);
  check('samples are encoded as little-endian PCM',
    view.getInt16(44, true) === 0 && view.getInt16(46, true) === 16383
    && view.getInt16(48, true) === -16384 && view.getInt16(50, true) === 32767
    && view.getInt16(52, true) === -32768);
  const clamped = new DataView(encodeWav16kMono(new Float32Array([2, -2])));
  check('out-of-range samples are clamped',
    clamped.getInt16(44, true) === 32767 && clamped.getInt16(46, true) === -32768);

  const down = resampleLinearTo16k(new Float32Array(48000), 48000);
  check('48 kHz -> 16 kHz yields one third of the samples', down.length === 16000);
  const constant = new Float32Array(48000).fill(0.25);
  check('constant signal survives resampling',
    resampleLinearTo16k(constant, 48000).every((v: number): boolean => Math.abs(v - 0.25) < 0.0001));
  const ramp = new Float32Array(48000);
  for (let i = 0; i < ramp.length; i += 1) ramp[i] = i / 48000;
  const ramped = resampleLinearTo16k(ramp, 48000);
  check('linear ramp is interpolated, not truncated',
    Math.abs((ramped[8000] ?? 0) - 0.5) < 0.001);
  check('invalid input rate is ignored',
    resampleLinearTo16k(samples, 0) === samples);

  const mono = mixToMono([new Float32Array([1, 1]), new Float32Array([0, 0])]);
  check('channels are averaged into mono', mono[0] === 0.5 && mono[1] === 0.5);
  check('empty channel list yields empty mono', mixToMono([]).length === 0);

  const vad = readFileSync('src/electron/renderer/src/hud/bridge/vad.ts', 'utf8');
  check('VAD silence timeout raised to 1800ms', vad.includes('SILENCE_MS = 1800'));
  const live = readFileSync('src/electron/renderer/src/hud/bridge/live-ui.ts', 'utf8');
  check('listening resumes 300ms after TTS ends', live.includes('listenSoon(300)'));
  check('microphone is stopped while the agent speaks',
    live.includes('voice.stop();') && live.includes('if (phase === \'idle\' && !speaking)'));
  const hex = readFileSync('src/voice/hex-stt.ts', 'utf8');
  check('Hex success log carries wavMs and bytes',
    hex.includes('chars: text.length, wavMs, bytes: audioBuffer.length'));

  finish();
}

main();
