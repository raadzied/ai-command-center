// HUD right-wing data: all values originate from the main-process snapshot.

import type { HudSnapshot } from '../../hud-api';
import type { ApexHudApi } from '../types';

let cached: HudSnapshot | null = null;
let polling = false;
let warned = false;

/** Latest snapshot received from the main process, or null before first fetch. */
export function getCachedSnapshot(): HudSnapshot | null {
  return cached;
}

function cap(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentOf(part: number, total: number): number {
  return total <= 0 ? 0 : cap((part / total) * 100);
}

/** Applies real counters to wing nodes and removes the old simulated entries. */
export function applyHudSnapshot(app: ApexHudApi, snapshot: HudSnapshot): void {
  cached = snapshot;
  const bars: Record<string, number> = {
    // Each bar maps a real quantity to 0..100 with a documented bound.
    sqlite: cap(snapshot.memory.dbSizeKb),
    context: cap(snapshot.context.recentMessages), // recentMessages is capped at 100 by main
    mcp: percentOf(snapshot.mcp.connected, snapshot.mcp.total),
    filesystem: percentOf(snapshot.filesystem.indexedFiles, snapshot.filesystem.maxFiles),
    voice: 0,
    telemetry: cap(snapshot.telemetry.rssMb),
  };
  for (const resource of app.resources) {
    resource.pct = bars[resource.id] ?? 0;
  }

  app.mcpServers.length = 0;
  app.mcpServers.push({
    id: 'mcp-hub',
    name: `MCP Hub (${snapshot.mcp.connected}/${snapshot.mcp.total})`,
    enabled: snapshot.mcp.connected > 0,
    latency: `${snapshot.mcp.toolCount} tools`,
  });

  app.memoryEntries.length = 0;
  const memory = snapshot.memory;
  app.memoryEntries.push(
    { key: 'conversations', value: String(memory.conversations), score: 'live' },
    { key: 'skills', value: String(memory.skills), score: 'live' },
    { key: 'decisions', value: String(memory.decisions), score: 'live' },
    { key: 'sessions', value: String(memory.sessions), score: 'live' },
  );
  app.renderWings();
}

/** Fetches and applies one snapshot. Logs failures only once. */
export async function refreshHudSnapshot(app: ApexHudApi): Promise<void> {
  try {
    const snapshot = await window.api.getHudSnapshot();
    applyHudSnapshot(app, snapshot);
    warned = false;
  } catch (err) {
    if (!warned) {
      app.addSystemLog('HUD', `Snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`);
      warned = true;
    }
  }
}

/** Starts the 15s visibility-aware refresh loop once per renderer instance. */
export function startHudSnapshotPolling(app: ApexHudApi): void {
  void refreshHudSnapshot(app);
  if (polling) return;
  polling = true;
  window.setInterval((): void => {
    if (!document.hidden) void refreshHudSnapshot(app);
  }, 15_000);
}
