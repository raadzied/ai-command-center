type Level = 'debug' | 'info' | 'warn' | 'error';

function isDebugEnabled(): boolean {
  return (process.env.LOG_LEVEL ?? 'info').toLowerCase() === 'debug';
}

function log(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (level === 'debug' && !isDebugEnabled()) return;
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  process.stderr.write(`[${ts}] ${level.toUpperCase()} ${msg}${metaStr}\n`);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};