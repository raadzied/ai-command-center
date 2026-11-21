/** Small DOM and formatting helpers shared by the HUD modules. */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes a value before it is interpolated into an HTML template. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char: string): string => ESCAPES[char] ?? char);
}

/** Typed `getElementById` that returns null instead of throwing. */
export function byId<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  return element instanceof HTMLElement ? (element as T) : null;
}

export function formatTime(totalSeconds: number): string {
  const hours = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
