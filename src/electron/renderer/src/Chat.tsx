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
          {copied ? '✓ COPIED' : 'COPY'}
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

export function Chat({
  onActiveAgent,
  onTaskInfo,
  onApprovalRequest,
}: ChatProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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

  const toggleWhisperFlow = async (): Promise<void> => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent): void => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async (): Promise<void> => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i] ?? 0);
        }
        const base64 = window.btoa(binary);

        setTranscribing(true);
        try {
          const res = await window.api.transcribeAudio(base64);
          if (res.ok && res.text) {
            setInput((prev) => (prev ? `${prev} ${res.text}` : (res.text ?? '')));
          }
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  return (
    <>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#4A5567',
            marginTop: 60,
            fontFamily: "'Consolas', monospace",
            fontSize: 12,
            letterSpacing: 1,
          }}>
            ◆ COMMAND CENTER READY<br />
            <span style={{ fontSize: 10, opacity: 0.6 }}>اكتب طلبك بالعربية للبدء</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-header">
              {msg.role === 'user'
                ? 'YOU'
                : msg.role === 'error'
                ? 'ERROR'
                : (msg.meta?.agent ?? 'SYSTEM').toUpperCase()}
            </div>
            <div className="message-body">
              {msg.role === 'agent' ? (
                <ReactMarkdown
                  components={{
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className ?? '');
                      const isBlock = (className ?? '').includes('language-');
                      const code = String(children).replace(/\n$/, '');
                      if (isBlock) {
                        return <CodeBlock language={match?.[1] ?? ''} code={code} />;
                      }
                      return (
                        <code style={{
                          background: '#0A121D',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontFamily: "'Consolas', monospace",
                          fontSize: '0.9em',
                          color: '#00E5FF',
                        }}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
            {msg.meta && (
              <div className="message-meta">
                {msg.meta.elapsedMs}ms · intent: {msg.meta.intent}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="composer" onSubmit={send}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.ctrlKey && e.code === 'Space') {
              e.preventDefault();
              void toggleWhisperFlow();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(e);
            }
          }}
          placeholder="اكتب طلبك… (Enter للإرسال)"
          rows={1}
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => void toggleWhisperFlow()}
          disabled={pending || transcribing}
          title="إملاء صوتي عبر Whisper Flow (Ctrl + Space)"
          style={{
            background: recording ? '#FF1744' : '#132235',
            color: recording ? '#FFFFFF' : '#00E5FF',
            border: `1px solid ${recording ? '#FF1744' : '#00E5FF'}`, 
            borderRadius: '8px',
            padding: '0 14px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {recording ? '⏹️ جاري التسجيل...' : transcribing ? '⏳ يحوّل النص...' : '🎤 Whisper'}
        </button>
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? '···' : 'إرسال'}
        </button>
      </form>
    </>
  );
}
