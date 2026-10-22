import { type FormEvent, useEffect, useRef, useState } from 'react';

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
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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
      .then((r) => { if (!r.ok) throw new Error('History unavailable'); return r.json(); })
      .then((data) => { if (!closed) setMessages(data.messages ?? []); })
      .catch(() => { if (!closed) setError('Conversation history could not be loaded.'); })
      .finally(() => {
        if (closed) return;
        source = new EventSource(`/api/threads/${threadId}/events`);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !connected) return;
    setError('');
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
    setMessages([]);
    setBusy(false);
    setThreadId(id);
  }

  const prompts = [
    ['01', 'Build my company profile', 'Help me build the profile of Rivage Numérique, a Lyon digital consultancy focused on RGAA accessibility, DSFR and sovereign cloud for local government. Ask me about the details you need.'],
    ['02', 'Prepare a bid review', 'Help me create a go/no-go checklist for a French public-sector IT tender. Ask me to paste the tender requirements first.'],
    ['03', 'Map the competition', 'Help me plan competitor research for French public-sector digital services. Explain what award data and sources we need before drawing conclusions.'],
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Procurement Radar home"><span className="brand-icon">◈</span> radar<span className="brand-dot">.</span></a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <div className="workspace"><span className="company-icon">R</span><div>Rivage Numérique<small>Demo company · Lyon, France</small></div></div>
        <div className="nav-active"><span>◎</span> Research copilot <span className="nav-arrow">↗</span></div>
        <div className="sidebar-note"><span className="eyebrow">THE OPPORTUNITY</span><h3>Less searching.<br />Better bids.</h3><p>Turn your capabilities and tender requirements into a clearer next move.</p></div>
        <div className="sidebar-footer"><span className="avatar">RN</span><div>French public procurement<small>IT & digital services · CPV 72</small></div></div>
      </aside>
      <section className="chat-panel">
        <header><div className="breadcrumb">Workspace <span>/</span> <strong>Research copilot</strong></div><button className="new-chat" onClick={newChat} disabled={busy}>＋ New conversation</button></header>
        <main aria-label="Conversation" aria-busy={busy}>
          {messages.length === 0 && <section className="welcome">
            <div className="eyebrow"><span className="spark">✧</span> YOUR PROCUREMENT RESEARCH PARTNER</div>
            <h1>Your next opportunity<br />starts with <em>clarity.</em></h1>
            <p className="intro">Build your company profile, unpack tender requirements, and plan your next bid. Let’s make public procurement feel a little less complicated.</p>
            <div className="prompt-grid">{prompts.map(([number, title, prompt]) => <button className="prompt-card" key={number} onClick={() => setInput(prompt)}><span className="card-number">{number}<span>↗</span></span><strong>{title}</strong><span className="card-description">{number === '01' ? 'Start with what makes you a strong fit.' : number === '02' ? 'Find the questions that matter before bidding.' : 'Know what to look for in past awards.'}</span></button>)}</div>
            <div className="scope-note"><span>◉</span> Focused on France · Built for small digital consultancies</div>
          </section>}
          {messages.map((m) => <article key={m.id} className={`message-row ${m.role}`}><div className="message-avatar">{m.role === 'user' ? 'RN' : '✧'}</div><div className="message-body"><span className="message-label">{m.role === 'user' ? 'You' : 'Radar copilot'}</span><div className="msg">{m.content || (busy ? 'Thinking…' : '')}</div></div></article>)}
          <div ref={bottomRef} />
        </main>
        <div className="composer-area">
          {error && <p className="error" role="alert">{error}</p>}
          <form onSubmit={send}>
            <label className="sr-only" htmlFor="message">Message the research copilot</label>
            <input id="message" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tell me about your company or paste a tender requirement…" autoFocus />
            <button className="send" type="submit" aria-label="Send message" disabled={busy || !connected || !input.trim()}>{busy ? '…' : '↑'}</button>
          </form>
          <div className="composer-footer"><span><i className={connected ? 'status online' : 'status'} />{connected ? 'Connected' : 'Connecting to copilot…'}</span><span>AI can make mistakes. Verify requirements against the source notice.</span></div>
        </div>
      </section>
    </div>
  );
}
