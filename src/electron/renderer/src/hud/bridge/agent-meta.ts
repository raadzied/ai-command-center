/** Agent name to constellation node mapping for the APEX HUD. */

export interface AgentMeta {
  node: string;
  label: string;
}

// أسماء العقد إنجليزية مطابقة للمخطط، والتسمية المعروضة بالإنجليزية كبقية الوكلاء.
// Advisor: مستشار استراتيجي ومعماري · Commander: مخطّط تنفيذي مرتّب بالأولويات.
export const AGENT_META: Record<string, AgentMeta> = {
  mentor: { node: 'mentor', label: 'Mentor' },
  coder: { node: 'coder', label: 'Coder' },
  designer: { node: 'designer', label: 'Designer' },
  advisor: { node: 'advisor', label: 'Advisor' },
  commander: { node: 'commander', label: 'Commander' },
};

export const agentLabel = (name: string | null): string =>
  name ? AGENT_META[name]?.label ?? name : 'Core';

// يعيد معرّف العقدة في الكوكبة، أو null إن لم يكن الوكيل معروفاً.
export function agentNodeId(name: string): string | null {
  return AGENT_META[name]?.node ?? null;
}
