// STEP 79 — Hex local offline STT: parsing, resolution, temp cleanup, fallback.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseHexOutput,
  resolveHexBinary,
  transcribeWithHex,
} from '../src/voice/hex-stt.js';
import type { HexSttDeps } from '../src/voice/hex-stt.js';
import {
  encodeWav16kMono,
  resampleLinearTo16k,
} from '../src/electron/renderer/src/hud/bridge/wav-encode.js';
import { check, finish } from './test-db-helpers.js';

interface FakeExecOptions {
  readonly shell: boolean;
  readonly timeout: number;
  readonly windowsHide: boolean;
  readonly maxBuffer: number;
}

const BINARY = 'C:/fake/hex';

function ascii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

function makeDeps(
  tempDir: string,
  onRun: (audioPath: string, args: readonly string[], options: FakeExecOptions) => Promise<string>,
): HexSttDeps {
  return {
    resolveBinary: (): string | null => BINARY,
    writeFile,
    removeFile: unlink,
    tempDir,
    runHex: async (
      _binary: string,
      args: readonly string[],
      options: FakeExecOptions,
    ): Promise<string> => {
      const audioPath = args[4];
      if (audioPath === undefined) throw new Error('missing audio path');
      return onRun(audioPath, args, options);
    },
  };
}

async function main(): Promise<void> {
  console.log('=== STEP 79 — Hex Local STT Test ===\n');

  check('JSON envelope with version/status/text',
    parseHexOutput('{"version":4,"status":"transcript","text":"مرحباً"}') === 'مرحباً');
  check('JSON envelope with transcript key',
    parseHexOutput('{"transcript":" hello world "}') === 'hello world');
  check('plain output is trimmed', parseHexOutput('  نص عادي  ') === 'نص عادي');
  check('malformed JSON falls back to raw text',
    parseHexOutput('{not json') === '{not json');

  const root = mkdtempSync(join(tmpdir(), 'apex-hex-stt-'));
  try {
    const binaryPath = join(root, 'hex.com');
    writeFileSync(binaryPath, 'fake');

    check('HEX_STT=0 disables the provider',
      resolveHexBinary({ HEX_STT: '0', HEX_CLI_PATH: binaryPath }) === null);
    check('HEX_STT=false disables the provider',
      resolveHexBinary({ HEX_STT: 'false', HEX_CLI_PATH: binaryPath }) === null);
    check('HEX_CLI_PATH is honored when the file exists',
      resolveHexBinary({ HEX_CLI_PATH: binaryPath }) === binaryPath);
    check('missing HEX_CLI_PATH returns null',
      resolveHexBinary({ HEX_CLI_PATH: join(root, 'missing.exe'), PATH: '' }) === null);

    const seenPaths: string[] = [];
    const seenOptions: FakeExecOptions[] = [];
    const seenArgs: string[][] = [];
    const successDeps = makeDeps(root, async (audioPath: string, args: readonly string[], options: FakeExecOptions): Promise<string> => {
      seenPaths.push(audioPath);
      seenOptions.push(options);
      seenArgs.push([...args]);
      if (!existsSync(audioPath)) throw new Error('audio file missing during exec');
      return '{"version":4,"status":"transcript","text":"تم الرفع"}';
    });
    const ok = await transcribeWithHex(Buffer.from('fake-audio'), 'audio/webm', successDeps);
    const tempPath = seenPaths[0] ?? '';
    const options = seenOptions[0];
    check('successful transcription is extracted', ok === 'تم الرفع');
    check('temporary audio file is deleted afterwards', tempPath !== '' && !existsSync(tempPath));
    check('temp file uses the requested extension', tempPath.endsWith('.webm'));
    const actualArgs = seenArgs[0] ?? [];
    check('hex args follow transcribe [OPTIONS] <FILE> order',
      actualArgs.length === 5 && actualArgs[0] === 'transcribe' && actualArgs[1] === '--json'
      && actualArgs[2] === '--language' && actualArgs[3] === 'ar' && actualArgs[4] === tempPath);
    check('execFile stays shell-free with a timeout',
      options !== undefined && options.shell === false && options.timeout === 30_000);
    check('execFile keeps windowsHide and maxBuffer',
      options !== undefined && options.windowsHide === true && options.maxBuffer === 2 * 1024 * 1024);

    const failedPaths: string[] = [];
    const warnings: Array<{ message: string; meta: Record<string, unknown> }> = [];
    const failingRun = (stderrText: string): HexSttDeps => ({
      ...makeDeps(root, async (audioPath: string): Promise<string> => {
        failedPaths.push(audioPath);
        throw Object.assign(new Error('hex crashed'), { stderr: stderrText });
      }),
      warn: (message: string, meta: Record<string, unknown>): void => {
        warnings.push({ message, meta });
      },
    });
    const failed = await transcribeWithHex(
      Buffer.from('fake-audio'), 'audio/wav', failingRun('model not found: ar\nline2'),
    );
    const failedTemp = failedPaths[0] ?? '';
    check('execution failure returns null', failed === null);
    check('temporary file is deleted after failure', failedTemp !== '' && !existsSync(failedTemp));
    const failureWarn = warnings.find((w) => w.message === 'Hex STT failed');
    check('stderr is logged with the failure',
      failureWarn !== undefined && failureWarn.meta['stderr'] === 'model not found: ar line2');

    await transcribeWithHex(Buffer.from('fake-audio'), 'audio/wav', failingRun('E'.repeat(400)));
    const truncated = warnings.filter((w) => w.message === 'Hex STT failed')[1];
    check('stderr snippet is capped at 250 chars',
      truncated !== undefined && String(truncated.meta['stderr']).length === 250);

    const emptyPaths: string[] = [];
    const emptyDeps = makeDeps(root, async (audioPath: string): Promise<string> => {
      emptyPaths.push(audioPath);
      return '{"transcript":"   "}';
    });
    const empty = await transcribeWithHex(Buffer.from('fake-audio'), undefined, emptyDeps);
    const emptyTemp = emptyPaths[0] ?? '';
    check('empty transcript returns null', empty === null);
    check('temporary file is deleted after empty transcript', emptyTemp !== '' && !existsSync(emptyTemp));

    const noBinary: HexSttDeps = {
      resolveBinary: (): string | null => null,
      writeFile: async (): Promise<void> => { throw new Error('must not write'); },
    };
    check('absent binary skips silently',
      (await transcribeWithHex(Buffer.from('fake-audio'), undefined, noBinary)) === null);

    const source = readFileSync('src/voice/hex-stt.ts', 'utf8');
    check('hex-stt.ts never uses shell: true', !source.includes('shell: true'));
    check('hex-stt.ts never uses cmd.exe', !source.includes('cmd.exe'));
    const whisper = readFileSync('src/voice/whisper.ts', 'utf8');
    check('whisper.ts runs Hex before the cloud chain',
      whisper.includes('STT succeeded via Hex local')
      && whisper.indexOf('await transcribeWithHex(') < whisper.indexOf('await callGeminiAudio('));
    check('whisper.ts forwards the mimeType to Hex',
      whisper.includes('transcribeWithHex(audioBuffer, mimeType ?? \'audio/webm\')'));
    const ipc = readFileSync('src/electron/voice-ipc.ts', 'utf8');
    check('voice IPC forwards mimeType',
      ipc.includes('transcribeWithWhisperFlow(base64Audio, audioMime)'));
    const renderer = readFileSync('src/electron/renderer/src/hud/bridge/voice.ts', 'utf8');
    check('renderer captures raw PCM and sends a WAV mimeType',
      renderer.includes('createScriptProcessor')
      && renderer.includes('resampleLinearTo16k(')
      && renderer.includes("api.transcribeAudio(base64FromBytes(new Uint8Array(wav)), 'audio/wav')"));
    const wav = readFileSync('src/electron/renderer/src/hud/bridge/wav-encode.ts', 'utf8');
    check('WAV encoder targets 16 kHz mono PCM',
      wav.includes('TARGET_RATE = 16000') && wav.includes('view.setUint16(22, 1, true)'));

    const pcm = encodeWav16kMono(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const header = new DataView(pcm);
    check('WAV is a 44-byte RIFF/WAVE header with fmt and data chunks',
      pcm.byteLength === 54 && ascii(header, 0, 4) === 'RIFF'
      && ascii(header, 8, 4) === 'WAVE' && ascii(header, 12, 4) === 'fmt '
      && ascii(header, 36, 4) === 'data');
    check('WAV header: PCM mono 16 kHz, byteRate 32000, blockAlign 2, 16-bit',
      header.getUint16(20, true) === 1 && header.getUint16(22, true) === 1
      && header.getUint32(24, true) === 16000 && header.getUint32(28, true) === 32000
      && header.getUint16(32, true) === 2 && header.getUint16(34, true) === 16);
    check('WAV sizes are little-endian and samples are clamped to [-1, 1]',
      header.getUint32(4, true) === 46 && header.getUint32(40, true) === 10
      && header.getInt16(50, true) === 32767 && header.getInt16(52, true) === -32768);
    const down = resampleLinearTo16k(new Float32Array(48000), 48000);
    check('linear resampling 48 kHz to 16 kHz yields one third of the samples',
      down.length === 16000 && down.every((value: number): boolean => value === 0));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  finish();
}

main().catch((err: unknown) => {
  console.error('Hex STT test failed:', err);
  process.exit(1);
});
