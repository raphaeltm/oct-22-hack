import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Markdown, Trace, useThread } from './ui';

type Msg = { id: string; role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Which three tenders should we bid on this month, and why?',
  'Who keeps winning IT data-platform contracts in France, and at what price?',
  'Find open tenders for accessibility (RGAA) audits in France or Belgium.',
];

function threadFor(companyId: string) {
  const key = `analyst-thread-${companyId}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function Analyst({ companyId }: { companyId: string }) {
  const [threadId, setThreadId] = useState(() => threadFor(companyId));
  const [history, setHistory] = useState<Msg[]>([]);
  const [pending, setPending] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const { runs, setRuns } = useThread(threadId, (id, content) =>
    setPending((p) => (p.some((m) => m.id === id) ? p : [...p, { id, role: 'user', content }])),
  );
  const busy = runs.some((r) => r.running);

  useEffect(() => setThreadId(threadFor(companyId)), [companyId]);
  useEffect(() => {
    setPending([]);
    setRuns([]);
    api.messages(threadId).then((r) => setHistory(r.messages)).catch(() => setHistory([]));
  }, [threadId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [runs, pending]);

  // Interleave live user messages and agent runs in arrival order.
  const live: ({ kind: 'user'; msg: Msg } | { kind: 'run'; i: number })[] = [];
  pending.forEach((msg, i) => {
    live.push({ kind: 'user', msg });
    if (runs[i]) live.push({ kind: 'run', i });
  });

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    const id = crypto.randomUUID();
    setPending((p) => [...p, { id, role: 'user', content: t }]);
    await api.chat(companyId, threadId, t, id).catch(() => {});
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function newChat() {
    const id = crypto.randomUUID();
    try {
      localStorage.setItem(`analyst-thread-${companyId}`, id);
    } catch {}
    setThreadId(id);
  }

  const empty = !history.length && !pending.length;

  return (
    <div className="analyst">
      <div className="analyst-scroll">
        {empty ? (
          <div className="analyst-intro">
            <h2>Ask the bid analyst</h2>
            <p>It can search open EU tenders, pull past award notices to see who wins and at what price, and draft bid material from your track record.</p>
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} className="starter" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="msgs">
            {history.map((m) => (
              <div key={m.id} className={`msg msg-${m.role}`}>
                {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              </div>
            ))}
            {live.map((item) =>
              item.kind === 'user' ? (
                <div key={item.msg.id} className="msg msg-user">
                  {item.msg.content}
                </div>
              ) : (
                <div key={runs[item.i].runId} className="msg msg-assistant">
                  <Trace steps={runs[item.i].steps} running={runs[item.i].running} />
                  {runs[item.i].text && <Markdown text={runs[item.i].text} />}
                  {runs[item.i].error && <p className="error">Stopped: {runs[item.i].error}</p>}
                </div>
              ),
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about tenders, buyers or competitors" aria-label="Message" />
        <button className="btn btn-ink" type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
        <button className="link" type="button" onClick={newChat} disabled={busy}>
          New conversation
        </button>
      </form>
    </div>
  );
}
