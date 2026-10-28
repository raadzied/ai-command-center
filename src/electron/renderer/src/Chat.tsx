import React, { useEffect, useRef, useState, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { Highlight, themes } from 'prism-react-renderer';
import type { ApprovalRequestData } from './window';

interface Message {
  role: 'user' | 'agent' | 'error';
  content: string;
  meta?: { agent?: string | null; intent?: string; elapsedMs?: number };
}

interface ChatProps {
  onActiveAgent: (agent: string | null) => void;
  onTaskInfo?: (info: { index: number; total: number } | null) => void;
  onApprovalRequest: (req: ApprovalRequestData | null) => void;
}

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language || 'text'}</span>
        <button className="code-block-copy" onClick={copy} type="button">
          {copied ? '✓ تم النسخ' : '📋 نسخ الكود'}
        </button>
      </div>
      <Highlight
        theme={themes.nightOwl}
        code={code}
        language={language || 'text'}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre style={{ ...style, background: 'transparent', margin: 0 }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function renderFormattedContent(content: string): React.JSX.Element {
  const parts: React.ReactNode[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      const textChunk = content.slice(lastIndex, matchIndex);
      parts.push(
        <ReactMarkdown key={`text-${lastIndex}`}>{textChunk}</ReactMarkdown>
      );
    }

    const language = match[1] ?? 'text';
    const code = match[2]?.trim() ?? '';
    parts.push(
      <CodeBlock key={`code-${matchIndex}`} language={language} code={code} />
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push(
      <ReactMarkdown key={`text-${lastIndex}`}>{remaining}</ReactMarkdown>
    );
  }

  return <div className="message-body">{parts}</div>;
}

export function Chat({
  onActiveAgent,
  onTaskInfo,
  onApprovalRequest,
}: ChatProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.api.onAgentActive((agent) => {
      onActiveAgent(agent);
    });
    window.api.onTaskStart((data) => {
      onTaskInfo?.(data);
    });
  }, [onActiveAgent, onTaskInfo]);

  useEffect(() => {
    window.api.onApprovalRequest((req) => {
      onApprovalRequest(req);
    });
  }, [onApprovalRequest]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setPending(true);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await window.api.sendInput(text);
      onTaskInfo?.(null);

      if (res.ok && res.content) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            content: res.content ?? '',
            meta: {
              agent: res.agentUsed,
              intent: res.intent,
              elapsedMs: res.elapsedMs,
            },
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: res.error ?? 'Unknown error' },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: String(err) },
      ]);
    } finally {
      setPending(false);
    }
  };

  const quickPromptsList = [
    '🧠 اشرح لي معمارية Microservices باختصار',
    '💻 اكتب دالة TypeScript للبحث الثنائي',
    '🎨 صمم نظام ألوان لواجهة لوحة تحكم',
    '⚡ حلل فكرة تطبيق مهام ثم صمم واجهته واكتب كوده',
  ];

  return (
    <>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#4A5567',
            marginTop: 80,
            fontFamily: "'Consolas', monospace",
            fontSize: 13,
            letterSpacing: 1.5,
          }}>
            ◆ COMMAND CENTER READY · V4.2 PRO<br />
            <span style={{ fontSize: 11, opacity: 0.6 }}>اختر أمراً سريعاً أدناه أو اكتب طلبك بالعربية للبدء</span>
          </div>
        )}
        {messages.map((msg, i) => {
          const agentLabel = msg.meta?.agent
            ? msg.meta.agent === 'mentor'
              ? '🧠 المرشد · Mentor'
              : msg.meta.agent === 'coder'
              ? '💻 المبرمج · Coder'
              : msg.meta.agent === 'designer'
              ? '🎨 المصمم · Designer'
              : `⚡ ${msg.meta.agent.toUpperCase()}`
            : '⚡ النواة';

          const timeSec = msg.meta?.elapsedMs ? `⏱️ ${(msg.meta.elapsedMs / 1000).toFixed(1)}s` : '';

          return (
            <div key={i} className={`message ${msg.role}`}>
              <div className="message-header">
                {msg.role === 'user'
                  ? '👤 أنت · YOU'
                  : msg.role === 'error'
                  ? '❌ خطأ · ERROR'
                  : `${agentLabel} ${timeSec}`}
              </div>
              {msg.role === 'agent' ? (
                renderFormattedContent(msg.content)
              ) : (
                <div className="message-body">{msg.content}</div>
              )}
              {msg.meta && (
                <div className="message-meta">
                  intent: {msg.meta.intent} {timeSec ? `· ${timeSec}` : ''}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-prompts">
        {quickPromptsList.map((promptText, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-prompt-btn"
            onClick={() => setInput(promptText)}
            disabled={pending}
          >
            {promptText}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
          placeholder="اكتب طلبك هنا… (Enter للإرسال)"
          rows={1}
          disabled={pending}
        />
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? '···' : 'إرسال ⚡'}
        </button>
      </form>
    </>
  );
}
