import type { ProjectBrief, ProjectBriefEntry, ProjectBriefResult } from '../../window';
import { byId, esc } from '../dom';
import { openInspectorPanel } from '../inspector';
import type { ApexHudApi } from '../types';

const refreshIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M3 17v1h5"/><path d="M21 7V6h-5"/></svg>';
const folderIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const fileIcon = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

function dailyBody(): string {
  return '<div class="ins-card"><span class="ins-text">Daily Mode — Open a project folder to inspect files</span></div>';
}

function scriptRows(brief: ProjectBrief): string {
  const scripts = Object.entries(brief.scripts);
  if (scripts.length === 0) return '<span class="ins-muted">No package scripts discovered</span>';
  return scripts.map(([name, command]: [string, string]): string =>
    `<div class="ins-row"><span class="ins-key">${esc(name)}</span><span class="ins-val" dir="auto">${esc(command)}</span></div>`,
  ).join('');
}

function treeRows(brief: ProjectBrief): string {
  if (brief.entries.length === 0) return '<span class="ins-muted">No visible project files</span>';
  return brief.entries.map((entry: ProjectBriefEntry): string => {
    const level = Math.min(entry.path.split('/').length - 1, 3) * 12;
    const icon = entry.kind === 'directory' ? folderIcon : fileIcon;
    return `<div class="ins-row" style="justify-content:flex-start; margin-inline-start:${level}px">` +
      `<span style="display:inline-flex; color:#7dd3fc">${icon}</span>` +
      `<span class="ins-val" dir="auto">${esc(entry.path)}</span></div>`;
  }).join('');
}

function briefBody(brief: ProjectBrief): string {
  const detected = brief.detectedFiles.length > 0 ? brief.detectedFiles.join(', ') : 'None';
  return `
    <div class="ins-card">
      <div class="ins-row"><span class="ins-section-title">Project Brief</span><button id="insp-refresh-brief" class="ins-btn is-cyan" type="button">${refreshIcon}<span>Refresh Brief</span></button></div>
      <div class="ins-row"><span class="ins-label">ROOT</span><span class="ins-value" dir="auto">${esc(brief.workspaceRoot)}</span></div>
      <div class="ins-row"><span class="ins-label">FILES</span><span class="ins-value">${brief.fileCount}</span></div>
      <div class="ins-row"><span class="ins-label">DETECTED</span><span class="ins-value">${esc(detected)}</span></div>
    </div>
    <div class="ins-card"><span class="ins-section-title">Build and Test Commands</span>${scriptRows(brief)}</div>
    <div class="ins-card"><span class="ins-section-title">Project Tree</span><div class="ins-list">${treeRows(brief)}</div></div>`;
}

function failureBody(result: Exclude<ProjectBriefResult, { ok: true; brief: ProjectBrief }>): string {
  if ('mode' in result) return dailyBody();
  return `<div class="ins-card"><span class="ins-text">${esc(result.error)}</span></div>`;
}

function showResult(app: ApexHudApi, result: ProjectBriefResult): void {
  if (!result.ok) {
    if ('mode' in result) {
      const resource = app.resources.find((item) => item.id === 'fs');
      if (resource) {
        resource.pct = 0;
        resource.desc = 'Daily Mode — no project folder selected';
      }
      app.renderWings();
    }
    openInspectorPanel('File System', 'PROJECT BRIEF', '#38BDF8', failureBody(result));
    return;
  }
  openInspectorPanel('File System', 'PROJECT BRIEF', '#38BDF8', briefBody(result.brief));
  byId<HTMLButtonElement>('insp-refresh-brief')?.addEventListener('click', (): void => {
    void loadBrief(app, true);
  });
}

async function loadBrief(app: ApexHudApi, refresh: boolean): Promise<void> {
  try {
    const result = refresh
      ? await window.api.refreshProjectBrief()
      : await window.api.getProjectBrief();
    showResult(app, result);
    if (result.ok) {
      const resource = app.resources.find((item) => item.id === 'fs');
      if (resource) {
        resource.pct = Math.round((result.brief.entries.length / 80) * 100);
        resource.desc = `Indexed ${result.brief.entries.length}/80 visible project entries`;
      }
      app.renderWings();
      app.addSystemLog('File System', `${refresh ? 'Refreshed' : 'Loaded'} ${result.brief.fileCount} files`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.showToast(`Project brief error: ${message.slice(0, 80)}`);
  }
}

export function openFileSystemInspector(app: ApexHudApi): void {
  void loadBrief(app, false);
}
