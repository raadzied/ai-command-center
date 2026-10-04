import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { classify, embed } from './classifier.cloud.js';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function groqOk(payload: { intent: string; confidence: number; reasoning: string }): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function geminiOk(): Response {
  return new Response(
    JSON.stringify({ embedding: { values: Array.from({ length: 768 }, () => 0.1) } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('classify', () => {
  it('يعيد learn لسؤال تعليمي', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(groqOk({ intent: 'learn', confidence: 0.9, reasoning: 'explain' })),
    ) as unknown as typeof fetch;
    const r = await classify('علّمني');
    assert.equal(r.intent, 'learn');
    assert.equal(r.confidence, 0.9);
  });

  it('يعيد build لطلب كود', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(groqOk({ intent: 'build', confidence: 0.85, reasoning: 'code' })),
    ) as unknown as typeof fetch;
    const r = await classify('أنشئ ملف');
    assert.equal(r.intent, 'build');
  });

  it('يعيد design بعد retry عند استجابة غير صالحة', async () => {
    let call = 0;
    globalThis.fetch = mock.fn(() => {
      call++;
      if (call === 1) {
        return Promise.resolve(new Response(
          JSON.stringify({ choices: [{ message: { content: '{"intent":"bad"}' } }] }),
          { status: 200 },
        ));
      }
      return Promise.resolve(groqOk({ intent: 'design', confidence: 0.8, reasoning: 'ui' }));
    }) as unknown as typeof fetch;
    const r = await classify('صمم');
    assert.equal(r.intent, 'design');
  });

  it('يعيد fallback chat بعد فشلين', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response('{}', { status: 500 })),
    ) as unknown as typeof fetch;
    const r = await classify('أي نص');
    assert.equal(r.intent, 'chat');
    assert.equal(r.confidence, 0);
  });

  it('يرمي عند غياب GROQ_API_KEY', async () => {
    delete process.env.GROQ_API_KEY;
    await assert.rejects(() => classify('نص'), /GROQ_API_KEY/);
  });
});

describe('embed', () => {
  it('يعيد متجه 768', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(geminiOk()),
    ) as unknown as typeof fetch;
    const v = await embed('نص');
    assert.equal(v.length, 768);
  });

  it('يرمي عند 500', async () => {
    globalThis.fetch = mock.fn(() =>
      Promise.resolve(new Response('error', { status: 500 })),
    ) as unknown as typeof fetch;
    await assert.rejects(() => embed('نص'), /Gemini embed failed/);
  });

  it('يرمي عند طول خاطئ', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve(new Response(
      JSON.stringify({ embedding: { values: Array(512).fill(0.1) } }),
      { status: 200 },
    )) as unknown as Response) as unknown as typeof fetch;
    await assert.rejects(() => embed('نص'), /768/);
  });
});