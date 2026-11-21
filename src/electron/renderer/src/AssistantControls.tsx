import React from 'react';
import type { AssistantMode } from './window';

interface AssistantControlsProps {
  mode: AssistantMode | null;
  voiceOn: boolean;
  permissionsOpen: boolean;
  onModeChange: (mode: AssistantMode) => void;
  onTogglePermissions: () => void;
  onToggleVoice: () => void;
  onStopVoice: () => void;
}

export function AssistantControls({
  mode,
  voiceOn,
  permissionsOpen,
  onModeChange,
  onTogglePermissions,
  onToggleVoice,
  onStopVoice,
}: AssistantControlsProps): React.JSX.Element {
  return (
    <>
      <div className="assistant-mode-control" aria-label="وضع المساعد">
        <button
          type="button"
          className={mode === 'planning' ? 'selected' : ''}
          disabled={!mode}
          onClick={() => onModeChange('planning')}
        >
          التخطيط
        </button>
        <button
          type="button"
          className={mode === 'build' ? 'selected' : ''}
          disabled={!mode}
          onClick={() => onModeChange('build')}
        >
          البناء
        </button>
        <button
          type="button"
          className={permissionsOpen ? 'selected' : ''}
          onClick={onTogglePermissions}
        >
          الصلاحيات
        </button>
      </div>
      <div className="assistant-voice-control">
        <button
          type="button"
          className={`voice-toggle ${voiceOn ? 'enabled' : 'disabled'}`}
          onClick={onToggleVoice}
        >
          {voiceOn ? '🔊 الصوت: مفعل' : '🔇 الصوت: مكتوم'}
        </button>
        <button type="button" className="voice-stop" onClick={onStopVoice}>
          ⏹️ إيقاف النطق
        </button>
      </div>
    </>
  );
}
