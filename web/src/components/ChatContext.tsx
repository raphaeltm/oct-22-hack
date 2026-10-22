import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export type Message = { id: string; role: 'user' | 'assistant'; content: string };

type ChatState = {
  threadId: string;
  messages: Message[];
  busy: boolean;
  /** The thread's SSE stream is subscribed (server sends an initial ping). */
  connected: boolean;
  error: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Send a message to the agent (also used by "Ask the agent" buttons). */
  send: (text: string) => Promise<void>;
  newChat: () => void;
};

const ChatContext = createContext<ChatState | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}

function getThreadId() {
  let id = localStorage.getItem('threadId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('threadId', id);
  }
  return id;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [threadId, setThreadId] = useState(getThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const connectedRef = useRef(false);
  connectedRef.current = connected;
  const [open, setOpen] = useState(() => localStorage.getItem('chatOpen') !== 'false');
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    localStorage.setItem('chatOpen', String(open));
  }, [open]);

  useEffect(() => {
    let source: EventSource | undefined;
    let closed = false;
    setMessages([]);
    setBusy(false);
    setConnected(false);
    setError('');

    const upsert = (id: string, role: Message['role'], update: (content: string) => string) =>
      setMessages((m) =>
        m.some((msg) => msg.id === id)
          ? m.map((msg) => (msg.id === id ? { ...msg, content: update(msg.content) } : msg))
          : [...m, { id, role, content: update('') }],
      );

    // Load persisted history, then follow live events for this thread.
    fetch(`/api/threads/${threadId}/messages`)
      .then((r) => {
        if (!r.ok) throw new Error('History unavailable');
        return r.json();
      })
      .then((data) => {
        if (!closed) setMessages(data.messages ?? []);
      })
      .catch(() => {
        if (!closed) setError('Conversation history could not be loaded.');
      })
      .finally(() => {
        if (closed) return;
        source = new EventSource(`/api/threads/${threadId}/events`);
        // The server pings once the stream cursor is pinned, so sends can't race the subscription.
        source.addEventListener('ping', () => setConnected(true));
        source.onerror = () => setConnected(false);
        source.addEventListener('user.message', (e) => {
          const ev = JSON.parse(e.data);
          upsert(ev.messageId, 'user', () => ev.content);
        });
        source.addEventListener('run.started', (e) => {
          upsert(JSON.parse(e.data).runId, 'assistant', (c) => c);
          setBusy(true);
        });
        source.addEventListener('text.delta', (e) => {
          const ev = JSON.parse(e.data);
          upsert(ev.runId, 'assistant', (c) => c + ev.delta);
        });
        source.addEventListener('run.finished', () => setBusy(false));
        source.addEventListener('run.error', (e) => {
          const ev = JSON.parse(e.data);
          upsert(ev.runId, 'assistant', (c) => `${c}\n[error: ${ev.error}]`);
          setBusy(false);
        });
      });

    return () => {
      closed = true;
      source?.close();
    };
  }, [threadId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busyRef.current) return;
      setOpen(true);
      setError('');
      setBusy(true);
      // "Ask the agent" buttons may fire before the stream is ready: wait briefly for it.
      for (let i = 0; i < 50 && !connectedRef.current; i++) await new Promise((r) => setTimeout(r, 100));

      const messageId = crypto.randomUUID();
      setMessages((m) => [...m, { id: messageId, role: 'user', content: text }]);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, message: text, messageId }),
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
      } catch (err) {
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: 'assistant', content: `[error: ${(err as Error).message}]` },
        ]);
        setBusy(false);
      }
    },
    [threadId],
  );

  const newChat = useCallback(() => {
    const id = crypto.randomUUID();
    localStorage.setItem('threadId', id);
    setMessages([]);
    setBusy(false);
    setThreadId(id);
  }, []);

  return (
    <ChatContext.Provider value={{ threadId, messages, busy, connected, error, open, setOpen, send, newChat }}>
      {children}
    </ChatContext.Provider>
  );
}
