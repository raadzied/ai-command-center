import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { isVoiceEnabled, setVoiceEnabled, cancelSpeech } from '../voice/state.js';
import { setElectronAudioEmitter } from '../voice/tts.js';
import { transcribeWithWhisperFlow } from '../voice/whisper.js';
import { emitActivity } from '../core/hud-activity.js';
import type { ActivityEmitter } from '../core/hud-activity.js';

function senderEmitter(event: IpcMainInvokeEvent): ActivityEmitter {
  return (payload): void => {
    if (!event.sender.isDestroyed()) event.sender.send('hud:activity', payload);
  };
}

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:status', (): boolean => isVoiceEnabled());

  ipcMain.handle('voice:toggle', (_event, enabled: unknown): boolean => {
    const next = typeof enabled === 'boolean' ? enabled : !isVoiceEnabled();
    setVoiceEnabled(next);
    if (!next) cancelSpeech();
    return isVoiceEnabled();
  });

  ipcMain.handle('voice:stop', (): void => {
    cancelSpeech();
    const win = BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('voice:stop-audio');
    }
  });

  ipcMain.handle(
    'voice:transcribe',
    async (
      event: IpcMainInvokeEvent,
      base64Audio: unknown,
      mimeType: unknown,
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      if (typeof base64Audio !== 'string' || !base64Audio.trim()) {
        return { ok: false, error: 'بيانات الصوت غير صالحة' };
      }
      const audioMime = typeof mimeType === 'string' && mimeType.trim() !== ''
        ? mimeType
        : 'audio/webm';
      const emit = senderEmitter(event);
      emitActivity(emit, { nodeId: 'voice', state: 'active', detail: 'جارٍ النسخ' });
      try {
        const text = await transcribeWithWhisperFlow(base64Audio, audioMime);
        emitActivity(emit, {
          nodeId: 'voice', state: 'done', detail: `${text.length} chars`, ttlMs: 2500,
        });
        return { ok: true, text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitActivity(emit, { nodeId: 'voice', state: 'error', detail: message, ttlMs: 2500 });
        return { ok: false, error: message };
      }
    },
  );

  setVoiceEnabled(true);
  setElectronAudioEmitter((payload) => {
    // Only the focused window may play audio — never a background project.
    const win = BrowserWindow.getFocusedWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('voice:audio', payload);
      emitActivity((activity): void => {
        if (!win.webContents.isDestroyed()) win.webContents.send('hud:activity', activity);
      }, { nodeId: 'voice', state: 'active', detail: 'تشغيل الصوت', ttlMs: 2500 });
    }
  });
}
