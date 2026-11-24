import { esc } from '../dom';

const FENCE = /```([A-Za-z0-9_-]*)\n([\s\S]*?)```/g;
const INLINE = /`([^`\n]+)`/g;

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// HTML يُهرَّب أولاً، ثم تُطبَّق رموز Markdown على النص المُهرَّب فقط.
export function renderSafeMarkdown(raw: string): string {
  const blocks: string[] = [];
  let text = raw.replace(FENCE, (_match: string, lang: string, body: string): string => {
    const attr = /^[A-Za-z0-9_-]+$/.test(lang) ? ` class="language-${esc(lang)}"` : '';
    blocks.push(`<pre dir="ltr"><code${attr}>${esc(body.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  const snippets: string[] = [];
  text = text.replace(INLINE, (_match: string, code: string): string => {
    snippets.push(`<code dir="ltr">${esc(code)}</code>`);
    return `\u0000I${snippets.length - 1}\u0000`;
  });

  text = esc(text);
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = (): void => {
    if (list !== null) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      closeList();
      continue;
    }
    if (/^\u0000B\d+\u0000$/.test(trimmed)) {
      closeList();
      out.push(trimmed);
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      out.push('<hr />');
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level} class="md-h${level}">${inlineFormat(heading[2] ?? '')}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inlineFormat((bullet ?? numbered)?.[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    out.push(`<p dir="auto">${inlineFormat(trimmed)}</p>`);
  }
  closeList();

  return out.join('')
    .replace(/\u0000I(\d+)\u0000/g, (_m: string, i: string): string => snippets[Number(i)] ?? '')
    .replace(/\u0000B(\d+)\u0000/g, (_m: string, i: string): string => blocks[Number(i)] ?? '');
}
