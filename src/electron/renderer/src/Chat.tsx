import { useState, useEffect, useRef, type FormEvent, type JSX } from 'react';
import type { ApprovalRequestData } from './window';

interface ChatProps {
  onActiveAgent: (agent: string | null) => void;
  onApprovalRequest: (req: ApprovalRequestData | null) => void;
}

interface MessageItem {
  id: string;
  role: 'user' | 'agent' | 'error';
  content: string;
  agent?: string | null;
  intent?: string;
  elapsedMs?: number;
}

export function Chat({ onActiveAgent, onApprovalRequest }: ChatProps): JSX.Element {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'init',
      role: 'agent',
      content: 'مرحبًا. اكتب طلبك بالعربية (مثال: علّمني، اكتب، صمم).',
      agent: 'النظام',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [pending, setPending] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    window.api.onApprovalRequest((data) => {
      onApprovalRequest(data);
    });
  }, [onApprovalRequest]);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setInput('');
    setPending(true);
    onActiveAgent('orchestrator');

    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
    ]);

    try {
      const result = await window.api.sendInput(text);
      if (result.ok) {
        const agentName = result.agentUsed ?? 'chat';
        onActiveAgent(agentName);
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            content: result.content ?? '',
            agent: agentName,
            intent: result.intent,
            elapsedMs: result.elapsedMs,
          },
        ]);
      } else {
        onActiveAgent(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'error',
            content: result.error ?? 'خطأ غير معروف',
          },
        ]);
      }
    } catch (err) {
      onActiveAgent(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'error',
          content: String(err),
        },
      ]);
    } finally {
      setPending(false);
      setTimeout(() => onActiveAgent(null), 2000);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages-list">
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="msg-header">
              {m.role === 'user' ? 'أنت' : m.role === 'error' ? 'خطأ' : m.agent ?? 'النظام'}
            </div>
            <div className="msg-body">{m.content}</div>
            {m.elapsedMs !== undefined && (
              <div className="msg-meta">
                {m.elapsedMs}ms · intent: {m.intent}
              </div>
            )}
          </div>
        ))}
        <div ref={chatBottomRef} />
      </div>

      <form className="composer-form" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب طلبك... (Enter للإرسال، Shift+Enter لسطر جديد)"
          rows={2}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
        />
        <button type="submit" disabled={pending || !input.trim()}>
          {pending ? 'جاري التنفيذ...' : 'إرسال'}
        </button>
      </form>
    </div>
  );
}
