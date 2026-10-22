import { FormEvent, useEffect, useRef, useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

function getThreadId() {
  let id = localStorage.getItem('threadId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('threadId', id);
  }
  return id;
}

export function App() {
  const [threadId, setThreadId] = useState(getThreadId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let source: EventSource | undefined;
    let closed = false;

    const upsert = (id: string, role: Message['role'], update: (content: string) => string) =>
      setMessages((m) =>
        m.some((msg) => msg.id === id)
          ? m.map((msg) => (msg.id === id ? { ...msg, content: update(msg.content) } : msg))
          : [...m, { id, role, content: update('') }],
      );

    // Load persisted history, then follow live events for this thread.
    fetch(`/api/threads/${threadId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]))
      .finally(() => {
        if (closed) return;
        source = new EventSource(`/api/threads/${threadId}/events`);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);

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
  }

  function newChat() {
    const id = crypto.randomUUID();
    localStorage.setItem('threadId', id);
    setThreadId(id);
  }

  return (
    <div className="app">
      <header>
        <h1>Agent</h1>
        <button onClick={newChat} disabled={busy}>New chat</button>
      </header>
      <main>
        {messages.length === 0 && <p className="empty">Say hello to get started.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.content || (busy ? '…' : '')}
          </div>
        ))}
        <div ref={bottomRef} />
      </main>
      <form onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the agent…"
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
