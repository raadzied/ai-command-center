// Skills tab: discovered/imported skills with per-project ON/OFF toggles.

import { esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { SkillView, SkillsResult } from '../../window';

type SkillsApi = Window['api'];

const PLUS_SVG =
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;

function toastError(app: ApexHudApi, result: SkillsResult): boolean {
  if (result.ok) return true;
  app.showToast(result.error ?? 'Skills action failed');
  return false;
}

function card(skill: SkillView): string {
  const label = skill.source === 'project' ? 'PROJECT' : 'GLOBAL';
  const badge = skill.source === 'project' ? 'is-project' : '';
  return `
    <div class="hub-card" data-skill-card="${skill.id}">
      <div class="hub-card-top">
        <span class="hub-name" dir="auto">${esc(skill.name)}</span>
        <span class="hub-badge ${badge}">${label}</span>
      </div>
      ${skill.description.trim() === '' ? '' : `<p class="hub-desc" dir="auto">${esc(skill.description)}</p>`}
      <div class="hub-card-foot">
        <span class="hub-muted">${esc(skill.slug)}</span>
        <button type="button" class="hub-toggle ${skill.effectiveEnabled ? 'is-on' : ''}"
          data-skill-toggle="${skill.id}" aria-pressed="${skill.effectiveEnabled}">${skill.effectiveEnabled ? 'ON' : 'OFF'}</button>
      </div>
    </div>`;
}

function markup(skills: SkillView[]): string {
  const list = skills.length === 0
    ? '<div class="hub-empty">No skills found. Import a SKILL.md or add one under data/skills/.</div>'
    : `<div class="hub-list">${skills.map(card).join('')}</div>`;
  return `
    <div class="hub-section-head">
      <span class="hub-title">INSTALLED SKILLS</span>
      <button type="button" class="hub-add" data-skill-import title="Import SKILL.md" aria-label="Import SKILL.md">
        ${PLUS_SVG} Import Skill
      </button>
    </div>
    ${list}`;
}

/** Fetches and renders the skills list into the given host, then wires actions. */
export async function renderSkillsPanel(app: ApexHudApi, host: HTMLElement): Promise<void> {
  let result: SkillsResult;
  try {
    result = await window.api.listSkills();
  } catch (err) {
    app.showToast(`Skills unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!toastError(app, result)) return;
  host.innerHTML = markup(result.skills);
  host.onclick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>('[data-skill-toggle]');
    if (toggle) {
      const id = Number(toggle.dataset['skillToggle']);
      const enabled = toggle.textContent?.trim() !== 'ON';
      if (!Number.isNaN(id)) void apply(app, host, window.api.toggleSkill(id, enabled));
      return;
    }
    if (target.closest('[data-skill-import]')) {
      void apply(app, host, window.api.importSkill());
    }
  };
}

async function apply(app: ApexHudApi, host: HTMLElement, action: Promise<SkillsResult>): Promise<void> {
  let result: SkillsResult;
  try {
    result = await action;
  } catch (err) {
    app.showToast(`Skills action failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!toastError(app, result)) return;
  app.showToast('Skills updated');
  await renderSkillsPanel(app, host);
}

export type { SkillsApi };
