import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useState } from 'react';
import { useEventStream, VERDICT_LABEL, type Verdict } from './api';

/** The verdict stamp: the radar's call, inked onto the dossier. */
export function Stamp({ verdict, size = 'md', landed = false }: { verdict: Verdict; size?: 'sm' | 'md' | 'lg'; landed?: boolean }) {
  return (
    <span className={`stamp stamp-${verdict} stamp-${size}${landed ? ' stamp-landed' : ''}`} aria-label={`Verdict: ${VERDICT_LABEL[verdict]}`}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function ScoreBar({ score, quick }: { score: number; quick?: boolean }) {
  return (
    <span className={`scorebar${quick ? ' scorebar-quick' : ''}`} title={quick ? 'Quick keyword score, not yet read by the agent' : 'Fit score from the agent'}>
      <span className="scorebar-num">{score}</span>
      <span className="scorebar-track">
        <span className="scorebar-fill" style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

const TOOL_VERB: Record<string, string> = {
  companyProfile: 'Read your track record',
  pipeline: 'Checked your shortlist',
  tenderDetails: 'Read the notice',
  searchTenders: 'Searched open notices on TED',
  awardHistory: 'Pulled past awards from TED',
  recordDecision: 'Recorded the decision',
};

export type Step = { callId: string; tool: string; args: unknown; summary?: string };

export function Trace({ steps, running }: { steps: Step[]; running: boolean }) {
  if (!steps.length && !running) return null;
  return (
    <ol className="trace" aria-label="What the agent did">
      {steps.map((s) => (
        <li key={s.callId} className={s.summary ? (s.summary.startsWith('failed') ? 'trace-failed' : 'trace-done') : 'trace-active'}>
          <span className="trace-dot" />
          <span className="trace-verb">{TOOL_VERB[s.tool] ?? s.tool}</span>
          {argHint(s.args) && <span className="trace-arg">{argHint(s.args)}</span>}
          {s.summary && <span className="trace-sum">{s.summary}</span>}
        </li>
      ))}
      {running && !steps.some((s) => !s.summary) && (
        <li className="trace-active">
          <span className="trace-dot" />
          <span className="trace-verb">{steps.length ? 'Writing' : 'Thinking'}</span>
        </li>
      )}
    </ol>
  );
}

function argHint(args: unknown) {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  const parts = [a.tenderId, a.buyer, a.text, Array.isArray(a.cpv) ? `CPV ${a.cpv.join(', ')}` : null, Array.isArray(a.countries) ? a.countries.join(' ') : null];
  return parts.filter(Boolean).join(' · ');
}

export type Run = { runId: string; text: string; steps: Step[]; running: boolean; error?: string };

/** Follow one thread's event stream and fold it into runs. */
export function useThread(threadId: string | null, onUser?: (id: string, content: string) => void, replay = false) {
  const [runs, setRuns] = useState<Run[]>([]);
  const patch = (runId: string, f: (r: Run) => Run) =>
    setRuns((rs) => (rs.some((r) => r.runId === runId) ? rs.map((r) => (r.runId === runId ? f(r) : r)) : [...rs, f({ runId, text: '', steps: [], running: true })]));
  useEventStream(threadId ? `/api/threads/${encodeURIComponent(threadId)}/events${replay ? '?since=0' : ''}` : null, {
    'user.message': (e) => onUser?.(e.messageId, e.content),
    'run.started': (e) => patch(e.runId, (r) => ({ ...r, running: true })),
    'text.delta': (e) => patch(e.runId, (r) => ({ ...r, text: r.text + e.delta })),
    'tool.call': (e) => patch(e.runId, (r) => ({ ...r, steps: [...r.steps, { callId: e.callId, tool: e.tool, args: e.args }] })),
    'tool.result': (e) =>
      patch(e.runId, (r) => ({ ...r, steps: r.steps.map((s) => (s.callId === e.callId ? { ...s, summary: e.summary } : s)) })),
    'run.finished': (e) => patch(e.runId, (r) => ({ ...r, running: false })),
    'run.error': (e) => patch(e.runId, (r) => ({ ...r, running: false, error: e.error })),
  });
  return { runs, setRuns };
}
