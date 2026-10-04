import 'dotenv/config';
import { chat } from '../src/llm/chat.js';

const originalFetch = globalThis.fetch;

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function groqOk(text: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function failWith(status: number): Response {
  return new Response('error', { status });
}

function setFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = ((input: unknown) => {
    const url =
      typeof input === 'string' ? input : String(input);
    return impl(url);
  }) as unknown as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

async function main(): Promise<void> {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  console.log('=== Chat Fallback Test ===\n');
  let passed = 0;
  const total = 3;

  // 1) Gemini 429 ثم Groq 200 → يعيد رد Groq
  try {
    setFetch((url) => {
      if (url.includes('generativelanguage')) {
        return Promise.resolve(failWith(429));
      }
      return Promise.resolve(groqOk('groq-reply'));
    });
    const r = await chat('sys', 'hi');
    if (r === 'groq-reply') {
      console.log('✓ Gemini 429 → Groq fallback يعيد رد Groq');
      passed++;
    } else {
      console.log(`✗ رد غير متوقع: ${r.slice(0, 80)}`);
    }
  } catch (err) {
    console.log('✗ الحالة 1 رمت:', err);
  } finally {
    restoreFetch();
  }

  // 2) كل النماذج تفشل → chat() يرمي
  try {
    setFetch(() => Promise.resolve(failWith(500)));
    await chat('sys', 'hi');
    console.log('✗ الحالة 2: لم يرمِ');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('All Groq chat models failed')) {
      console.log('✓ فشل الكل → يرمي All Groq chat models failed');
      passed++;
    } else {
      console.log(`✗ رسالة غير متوقعة: ${msg}`);
    }
  } finally {
    restoreFetch();
  }

  // 3) Gemini 200 → لا يستدعي Groq أبدًا
  try {
    let groqCalls = 0;
    setFetch((url) => {
      if (url.includes('api.groq.com')) groqCalls++;
      return Promise.resolve(geminiOk('gemini-reply'));
    });
    const r = await chat('sys', 'hi');
    if (r === 'gemini-reply' && groqCalls === 0) {
      console.log('✓ Gemini 200 → بلا أي استدعاء Groq');
      passed++;
    } else {
      console.log(`✗ رد=${r.slice(0, 40)} groqCalls=${groqCalls}`);
    }
  } catch (err) {
    console.log('✗ الحالة 3 رمت:', err);
  } finally {
    restoreFetch();
  }

  console.log(`\n=== ${passed}/${total} passed ===`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
