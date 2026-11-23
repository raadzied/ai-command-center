import { ApexHud } from './app';
import { bindBridge } from './bridge';
import { bindControls } from './controls';
import { startCoreCanvas } from './core';
import type { CoreStatus } from './types';
import './hud.css';
import './hud-panels.css';
import './project-panel.css';

function boot(): void {
  const app = new ApexHud();
  const core = startCoreCanvas(
    (): CoreStatus => app.state.coreStatus,
    (): number => app.state.burstUntil,
  );

  bindControls(app, core);
  app.setCoreStatus('THINKING');
  bindBridge(app);

  (window as Window & { __APEX__?: ApexHud }).__APEX__ = app;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
