import { ipcMain } from 'electron';
import {
  getAssistantSettings,
  isPermissionId,
  setAssistantMode,
  setPermission,
} from '../security/settings.js';
import type { AssistantSettings } from '../security/settings.js';

export function registerAssistantSettingsHandlers(): void {
  ipcMain.handle('assistant:settings:get', (): AssistantSettings => {
    return getAssistantSettings();
  });

  ipcMain.handle('assistant:settings:mode', (_event, value: unknown): AssistantSettings => {
    if (value !== 'planning' && value !== 'build') {
      throw new Error('وضع المساعد غير صالح');
    }
    return setAssistantMode(value);
  });

  ipcMain.handle(
    'assistant:settings:permission',
    (_event, value: unknown): AssistantSettings => {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('permission' in value) ||
        !('enabled' in value)
      ) {
        throw new Error('تغيير الصلاحية غير صالح');
      }
      const permission = value.permission;
      const enabled = value.enabled;
      if (!isPermissionId(permission) || typeof enabled !== 'boolean') {
        throw new Error('تغيير الصلاحية غير صالح');
      }
      return setPermission(permission, enabled);
    },
  );
}
