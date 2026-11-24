import type { AgentNode, MemoryEntry, McpServer, ResourceNode, SystemLog } from './types';

/** Monochrome geometric SVG icons (no emoji, stroke based). */
export const ICONS: Record<string, string> = {
  orchestrator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"></path></svg>`,
  coder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline><line x1="14" y1="4" x2="10" y2="20"></line></svg>`,
  designer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`,
  advisor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>`,
  browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  commander: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  sqlite: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
  context: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="7" y1="6.5" x2="7.01" y2="6.5"></line><line x1="10" y1="6.5" x2="10.01" y2="6.5"></line></svg>`,
  mcp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="7" rx="1.5"></rect><rect x="2" y="14" width="20" height="7" rx="1.5"></rect><line x1="6" y1="6.5" x2="6.01" y2="6.5"></line><line x1="6" y1="17.5" x2="6.01" y2="17.5"></line></svg>`,
  filesystem: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  telemetry: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><polyline points="7 12 10 12 11.5 9 13 15 14.5 12 17 12"></polyline></svg>`,
};

/** Left wing — seven agent nodes, all idle until a real event arrives. */
export const AGENTS: AgentNode[] = [
  {
    id: 'orchestrator', name: 'Orchestrator', active: false, status: 'idle',
    icon: ICONS.orchestrator ?? '', role: 'Central DAG Planner & Dispatcher',
    task: 'Awaiting live orchestration events', logs: [],
  },
  {
    id: 'mentor', name: 'Mentor', active: false, status: 'idle',
    icon: ICONS.advisor ?? '', role: 'Educational Guide & Prompt Engineer',
    task: 'Awaiting dispatch', logs: [],
  },
  {
    id: 'coder', name: 'Coder', active: false, status: 'idle',
    icon: ICONS.coder ?? '', role: 'TypeScript / Electron Engineer',
    task: 'Awaiting dispatch', logs: [],
  },
  {
    id: 'designer', name: 'Designer', active: false, status: 'idle',
    icon: ICONS.designer ?? '', role: 'Tactical UI & Visual Architect',
    task: 'Awaiting dispatch', logs: [],
  },
  {
    id: 'advisor', name: 'Advisor', active: false, status: 'idle',
    icon: ICONS.advisor ?? '', role: 'Strategic & Architecture Advisor',
    task: 'Awaiting consultation', logs: [],
  },
  {
    id: 'browser', name: 'Browser', active: false, status: 'idle',
    icon: ICONS.browser ?? '', role: 'MCP Web & API Anything',
    task: 'Awaiting MCP activity', logs: [],
  },
  {
    id: 'commander', name: 'Commander', active: false, status: 'idle',
    icon: ICONS.commander ?? '', role: 'Execution Planning & Priority Ordering',
    task: 'Awaiting planning request', logs: [],
  },
];

/** Right wing — six resource nodes, filled by the live snapshot. */
export const RESOURCES: ResourceNode[] = [
  { id: 'sqlite', name: 'SQLite Memory', pct: 0, status: 'idle', icon: ICONS.sqlite ?? '', type: 'memory', desc: 'Persistent conversations, skills, decisions and sessions' },
  { id: 'context', name: 'Context Window', pct: 0, status: 'idle', icon: ICONS.context ?? '', type: 'context', desc: 'Live session messages and enabled instruction skills' },
  { id: 'mcp', name: 'MCP Servers', pct: 0, status: 'idle', icon: ICONS.mcp ?? '', type: 'mcp', desc: 'Connected MCP servers and their tool inventory' },
  { id: 'filesystem', name: 'File System', pct: 0, status: 'idle', icon: ICONS.filesystem ?? '', type: 'fs', desc: 'Workspace files indexed from the scoped project root' },
  { id: 'voice', name: 'Voice Engine', pct: 0, status: 'idle', icon: ICONS.voice ?? '', type: 'voice', desc: 'Speech pipeline for the focused HUD window' },
  { id: 'telemetry', name: 'System Telemetry', pct: 0, status: 'idle', icon: ICONS.telemetry ?? '', type: 'telemetry', desc: 'Actual RSS memory, heap usage and process uptime' },
];

// populate from the main-process snapshot — no fabricated seed values.
export const MCP_SERVERS: McpServer[] = [];
export const MEMORY_ENTRIES: MemoryEntry[] = [];
export const SYSTEM_LOGS: SystemLog[] = [];
