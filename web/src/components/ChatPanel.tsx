import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from './ChatContext';
import { Icon } from './ui';

const SUGGESTIONS = [
  ['Build my company profile', 'Help me build the profile of Rivage Numérique, a Lyon digital consultancy focused on RGAA accessibility, DSFR and sovereign cloud for local government. Ask me about the details you need.'],
  ['Prepare a bid review', 'Help me create a go/no-go checklist for a French public-sector IT tender. Ask me to paste the tender requirements first.'],
  ['Map the competition', 'Who wins the most French public digital-services contracts like ours, and with which buyers?'],
];

export function ChatPanel() {
  const { messages, busy, connected, error, send, newChat, setOpen } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy || !connected) return;
    send(input);
    setInput('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const last = messages.at(-1);
  const waiting = busy && (!last || last.role === 'user' || !last.content);

  return (
    <aside className="chat">
      <header className="chat-head">
        <div className="chat-title">
          <span className="agent-dot" data-busy={busy} data-offline={!connected} />
          <div>
            <strong>Radar copilot</strong>
            <small>{busy ? 'Thinking…' : connected ? 'Ask about tenders and competitors' : 'Connecting…'}</small>
          </div>
        </div>
        <div className="chat-actions">
          <button className="icon-btn" onClick={newChat} disabled={busy} title="New chat">
            <Icon name="plus" />
          </button>
          <button className="icon-btn" onClick={() => setOpen(false)} title="Hide chat">
            <Icon name="close" />
          </button>
        </div>
      </header>

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon"><Icon name="spark" /></div>
            <p>Ask the agent to qualify a tender, profile a competitor or draft a go/no-go brief.</p>
            <div className="suggestions">
              {SUGGESTIONS.map(([title, prompt]) => (
                <button key={title} className="suggestion" onClick={() => setInput(prompt)} title={prompt}>
                  <strong>{title}</strong>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg user">{m.content}</div>
          ) : m.content ? (
            <div key={m.id} className="msg assistant md">
              <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
                {m.content}
              </Markdown>
            </div>
          ) : null,
        )}
        {waiting && (
          <div className="msg assistant typing" aria-label="Agent is typing">
            <span /><span /><span />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="chat-error" role="alert">{error}</p>}

      <form className="chat-input" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the agent…"
          rows={2}
        />
        <button type="submit" className="send-btn" disabled={busy || !connected || !input.trim()} title="Send">
          <Icon name="send" />
        </button>
      </form>
    </aside>
  );
}
