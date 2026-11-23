import { BrowserWindow, ipcMain } from 'electron';
import { isVoiceEnabled, setVoiceEnabled, cancelSpeech } from '../voice/state.js';
import { setElectronAudioEmitter } from '../voice/tts.js';
import { transcribeWithWhisperFlow } from '../voice/whisper.js';

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
      _event,
      base64Audio: unknown,
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      if (typeof base64Audio !== 'string' || !base64Audio.trim()) {
        return { ok: false, error: 'بيانات الصوت غير صالحة' };
      }
      try {
        const text = await transcribeWithWhisperFlow(base64Audio);
        return { ok: true, text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
    }
  });
}
