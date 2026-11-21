import React, { useEffect, useRef, useState, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { Highlight, themes } from 'prism-react-renderer';
import type { ApprovalRequestData } from './window';
import { TacticalIcon } from './components/apex-hud/TacticalIcons';
import type { ApexCoreState } from './components/apex-hud/useApexTelemetry';

interface Message {
  role: 'user' | 'agent' | 'error';
  content: string;
  meta?: { agent?: string | null; intent?: string; elapsedMs?: number };
}

interface ChatProps {
  onActiveAgent: (agent: string | null) => void;
  onTaskInfo?: (info: { index: number; total: number } | null) => void;
  onApprovalRequest: (req: ApprovalRequestData | null) => void;
  onResponse?: (content: string) => void;
  onVoiceState?: (state: ApexCoreState) => void;
  variant?: 'apex' | 'dag';
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
          {copied ? 'تم النسخ' : 'نسخ الكود'}
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
  onResponse,
  onVoiceState,
  variant = 'dag',
}: ChatProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [transcribing, setTranscribing] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeAgent = window.api.onAgentActive((agent) => {
      onActiveAgent(agent);
    });
    const unsubscribeTask = window.api.onTaskStart((data) => {
      onTaskInfo?.(data);
    });
    return () => {
      unsubscribeAgent();
      unsubscribeTask();
    };
  }, [onActiveAgent, onTaskInfo]);

  useEffect(() => {
    const unsubscribe = window.api.onApprovalRequest((req) => {
      onApprovalRequest(req);
    });
    return unsubscribe;
  }, [onApprovalRequest]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1] ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const startRecording = async (): Promise<void> => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e: BlobEvent): void => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async (): Promise<void> => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        if (blob.size < 2000) {
          setTranscribing(false);
          return;
        }

        setTranscribing(true);
        try {
          const base64 = await blobToBase64(blob);
          const result = await window.api.transcribeAudio(base64);
          if (result.ok && result.text) {
            setInput((prev) => (prev ? `${prev} ${result.text}` : (result.text ?? '')));
          } else {
            setMessages((prev) => [
              ...prev,
              { role: 'error', content: 'فشل تحويل الصوت: ' + (result.error ?? 'Unknown error') },
            ]);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setMessages((prev) => [
            ...prev,
            { role: 'error', content: 'خطأ في الإملاء الصوتي: ' + message },
          ]);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
      onVoiceState?.('LISTENING');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRecording(false);
      setTranscribing(false);
      onVoiceState?.('ERROR');
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: 'تعذر بدء التسجيل الصوتي: ' + message },
      ]);
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      onVoiceState?.('THINKING');
    }
  };

  const toggleWhisper = (): void => {
    if (recording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        toggleWhisper();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [recording, transcribing]);

  const send = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setPending(true);
    setInput('');
    onVoiceState?.('THINKING');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await window.api.sendInput(text);
      onTaskInfo?.(null);

      if (res.ok && res.content) {
        onResponse?.(res.content);
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
      onVoiceState?.('IDLE');
    }
  };

  const quickPromptsList = [
    'اشرح لي معمارية Microservices باختصار',
    'اكتب دالة TypeScript للبحث الثنائي',
    'صمم نظام ألوان لواجهة لوحة تحكم',
    'حلل فكرة تطبيق مهام ثم صمم واجهته واكتب كوده',
  ];

  return (
    <div className={`chat chat--${variant}`}>
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
            COMMAND CENTER READY · V4.2 PRO<br />
            <span style={{ fontSize: 11, opacity: 0.6 }}>اختر أمراً سريعاً أدناه أو اكتب طلبك بالعربية للبدء</span>
          </div>
        )}
        {messages.map((msg, i) => {
          const agentLabel = msg.meta?.agent
            ? msg.meta.agent === 'mentor'
              ? 'المرشد · Mentor'
              : msg.meta.agent === 'coder'
              ? 'المبرمج · Coder'
              : msg.meta.agent === 'designer'
              ? 'المصمم · Designer'
              : msg.meta.agent.toUpperCase()
            : 'النواة';

          const timeSec = msg.meta?.elapsedMs ? `${(msg.meta.elapsedMs / 1000).toFixed(1)}s` : '';

          return (
            <div key={i} className={`message ${msg.role}`}>
              <div className="message-header">
                {msg.role === 'user'
                  ? 'أنت · YOU'
                  : msg.role === 'error'
                  ? 'خطأ · ERROR'
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

      {variant === 'dag' ? <div className="quick-prompts">
        {quickPromptsList.map((promptText, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-prompt-btn"
            onClick={() => setInput(promptText)}
            disabled={pending || recording || transcribing}
          >
            {promptText}
          </button>
        ))}
      </div> : null}

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
          placeholder="اكتب طلبك هنا أو اضغط Ctrl+Space للإملاء الصوتي…"
          rows={1}
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => toggleWhisper()}
          disabled={pending || transcribing}
          title={recording ? 'إيقاف التسجيل' : 'تسجيل صوتي (Ctrl+Space)'}
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: recording ? '#FF3355' : (transcribing ? '#4A5567' : '#0D1622'),
            border: recording ? '1px solid #FF3355' : '1px solid #1E3A4C',
            color: recording ? '#fff' : '#00E5FF',
            cursor: transcribing ? 'wait' : 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            boxShadow: recording ? '0 0 16px rgba(255,51,85,0.6)' : 'none',
            animation: recording ? 'pulse-mic 1.2s ease-in-out infinite' : 'none',
          }}
        >
          {transcribing ? '...' : <TacticalIcon name={recording ? 'pause' : 'mic'} size={18} />}
        </button>
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? '...' : <TacticalIcon name="send" size={17} />}
        </button>
      </form>
    </div>
  );
}
