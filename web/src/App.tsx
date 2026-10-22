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
    fetch(`/api/threads/${threadId}/messages`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]));
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

    const assistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    const append = (chunk: string) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg)));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        append(value);
      }
    } catch (err) {
      append(`\n[error: ${(err as Error).message}]`);
    } finally {
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
