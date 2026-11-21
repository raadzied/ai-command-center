import React from 'react';

export type TacticalIconName =
  | 'orchestrator'
  | 'coder'
  | 'designer'
  | 'advisor'
  | 'browser'
  | 'terminal'
  | 'memory'
  | 'context'
  | 'mcp'
  | 'files'
  | 'mic'
  | 'telemetry'
  | 'settings'
  | 'close'
  | 'kill'
  | 'play'
  | 'pause'
  | 'send'
  | 'copy';

interface TacticalIconProps {
  name: TacticalIconName;
  size?: number;
  title?: string;
}

function IconPaths({ name }: Pick<TacticalIconProps, 'name'>): React.JSX.Element {
  switch (name) {
    case 'orchestrator':
      return <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3" /></>;
    case 'coder':
      return <><path d="m8 7-4 5 4 5M16 7l4 5-4 5M14 4l-4 16" /></>;
    case 'designer':
      return <><path d="m5 19 1.2-4.4L16.9 3.9a2.1 2.1 0 0 1 3 3L9.2 17.6 5 19Z" /><path d="m14.8 6 3.2 3.2" /></>;
    case 'advisor':
      return <><path d="M12 3 5.5 6v5.4c0 4.1 2.7 7.7 6.5 9.1 3.8-1.4 6.5-5 6.5-9.1V6L12 3Z" /><path d="M9.5 12h5M12 9.5v5" /></>;
    case 'browser':
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 8h18M7 6h.1M10 6h.1" /></>;
    case 'terminal':
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12.5 15H17" /></>;
    case 'memory':
      return <><ellipse cx="12" cy="5.5" rx="7" ry="3" /><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>;
    case 'context':
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h10M7 12h7M7 15h4" /></>;
    case 'mcp':
      return <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7.7 7.3 2.7 8M16.3 7.3l-2.7 8M8 6h8" /></>;
    case 'files':
      return <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10Z" /></>;
    case 'mic':
      return <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M8.5 21h7" /></>;
    case 'telemetry':
      return <><path d="M4 18V6M9 18v-5M14 18V9M19 18V4" /><path d="M3 20h18" /></>;
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.3v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>;
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />;
    case 'kill':
      return <><circle cx="12" cy="12" r="8" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>;
    case 'play':
      return <path d="m9 6 8 6-8 6V6Z" />;
    case 'pause':
      return <><path d="M8 6v12M16 6v12" /></>;
    case 'send':
      return <><path d="m3 11.5 17-8-6.5 17-2.2-6.8L3 11.5Z" /><path d="m11.3 13.7 3.3-3.3" /></>;
    case 'copy':
      return <><rect x="8" y="8" width="11" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H8" /></>;
  }
}

export function TacticalIcon({
  name,
  size = 18,
  title,
}: TacticalIconProps): React.JSX.Element {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      height={size}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      <IconPaths name={name} />
    </svg>
  );
}
