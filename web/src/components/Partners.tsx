// Partner finder: gaps in a tender vs the company profile, firms to co-bid with
// (from TED awards and eForms groupements), invites the user sends from their own
// mail client, and scored responses.
import { useState } from 'react';
import { Link } from 'react-router';
import {
  api,
  type PartnerCandidate,
  type PartnerBacktest,
  type PartnerFinder,
  type PartnerInvite,
  type PartnerRole,
  ROLE_LABELS,
} from '../api';
import { AskButton, Empty, ErrorState, formatDate, Icon, Initials, Loading, PageHeader, ScoreRing, Stat, useApi } from './ui';

// What we ask the partner for, in French (it is quoted in the email and on their response page).
const NEED_FR: Record<string, string> = {
  hosting: 'l’hébergement et l’infogérance',
  security: 'la cybersécurité',
  tma: 'la tierce maintenance applicative (TMA)',
  data: 'la data et le décisionnel',
  gis: 'le SIG et la géomatique',
  amoa: 'l’assistance à maîtrise d’ouvrage (AMOA)',
  erp: 'l’intégration de progiciels',
  change: 'la conduite du changement et la formation',
  accessibility: 'l’accessibilité numérique (RGAA)',
  ux: 'l’UX et le design de service',
  web: 'le développement web',
  mobile: 'les applications mobiles',
  network: 'les réseaux et l’infrastructure',
  ai: 'l’intelligence artificielle',
  health: 'l’hébergement de données de santé (HDS)',
};

function defaultNeed(finder: PartnerFinder, partner: PartnerCandidate | null) {
  const keys = finder.gaps.filter((g) => !partner || partner.covers.includes(g.label)).map((g) => g.key);
  const parts = (keys.length ? keys : finder.gaps.map((g) => g.key)).map((k) => NEED_FR[k]).filter(Boolean);
  if (!parts.length) return 'renforcer notre capacité de production sur ce marché';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
}

const STATUS: Record<PartnerInvite['status'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Sent', tone: 'muted' },
  opened: { label: 'Opened', tone: 'consider' },
  responded: { label: 'Responded', tone: 'go' },
};

// ---------------------------------------------------------------- tender panel

export function PartnerFinderPanel({ tenderId }: { tenderId: string }) {
  const finder = useApi(() => api.partners(tenderId), [tenderId]);
  const invites = useApi(() => api.invites(tenderId), [tenderId]);
  const [composing, setComposing] = useState<PartnerCandidate | 'other' | null>(null);
  const [draft, setDraft] = useState<PartnerInvite | null>(null);

  const invited = new Map((invites.data ?? []).filter((i) => i.organisationId).map((i) => [i.organisationId!, i]));

  return (
    <section className="brief partners">
      <div className="section-head">
        <div>
          <h2 className="section-title"><Icon name="handshake" /> Partner finder</h2>
          <p className="muted">Firms to bid with, as a groupement or a subcontractor, from real TED awards and joint bids.</p>
        </div>
        <AskButton
          variant="secondary"
          label="Ask about partners"
          prompt={`For tender ${finder.data?.tender.publicationNumber ?? tenderId}, what can't we cover alone, and who should we team up with? Use the partner finder.`}
        />
      </div>

      {finder.loading && !finder.data && <Loading label="Finding partners…" />}
      {finder.error && (finder.error.includes('404') ? <Empty>Set up your company profile first: gaps are measured against it.</Empty> : <ErrorState message={finder.error} />)}
      {finder.data && (
        <>
          <div className="card gaps-card">
            {finder.data.gaps.length > 0 ? (
              <>
                <h3 className="sub-title">What you'd need a partner for</h3>
                <ul className="gaps">
                  {finder.data.gaps.map((g) => (
                    <li key={g.key}>
                      <span className="chip gap">{g.label}</span>
                      {g.evidence && <q className="muted small" lang="fr">{g.evidence}</q>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small">Your profile covers what this notice asks for, so these are <strong>capacity partners</strong>: firms with similar wins, preferably ones that have bid jointly before.</p>
            )}
            {finder.data.covered.length > 0 && (
              <p className="muted small">You already cover: {finder.data.covered.join(', ')}.</p>
            )}
          </div>

          {draft && <InviteDraft invite={draft} onClose={() => setDraft(null)} onSent={invites.reload} />}
          {composing && !draft && (
            <InviteComposer
              finder={finder.data}
              partner={composing === 'other' ? null : composing}
              onCancel={() => setComposing(null)}
              onCreated={(inv) => {
                setComposing(null);
                setDraft(inv);
                invites.reload();
              }}
            />
          )}

          {finder.data.partners.length === 0 ? (
            <Empty>No firm in the TED award data shows these capabilities yet.</Empty>
          ) : (
            <div className="competitor-grid">
              {finder.data.partners.map((p) => (
                <PartnerCard
                  key={p.organisationId}
                  p={p}
                  invite={invited.get(p.organisationId) ?? null}
                  onInvite={() => {
                    setDraft(null);
                    setComposing(p);
                  }}
                />
              ))}
            </div>
          )}
          <div className="partners-foot">
            <button className="btn ghost small" onClick={() => { setDraft(null); setComposing('other'); }}>
              <Icon name="plus" size={14} /> Invite a firm that's not listed
            </button>
            <p className="muted small brief-note">{finder.data.notes.slice(1).join(' ')}</p>
          </div>

          {(invites.data?.length ?? 0) > 0 && (
            <>
              <h3 className="sub-title">Invites for this tender</h3>
              <div className="invite-list">
                {invites.data!.map((i) => <InviteRow key={i.id} invite={i} showTender={false} onChange={invites.reload} />)}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function PartnerCard({ p, invite, onInvite }: { p: PartnerCandidate; invite: PartnerInvite | null; onInvite: () => void }) {
  const cobid = p.coBids[0];
  return (
    <div className="card competitor-card partner-card">
      <div className="competitor-card-head">
        <Initials name={p.name} />
        <div className="grow">
          <Link to={`/competitors/${p.organisationId}`} className="strong">{p.name}</Link>
          <div className="muted small">{[p.city, p.siret ? `SIRET ${p.siret}` : null].filter(Boolean).join(' · ') || `${p.wins} TED award${p.wins === 1 ? '' : 's'}`}</div>
        </div>
        <ScoreRing score={p.score} size={40} />
      </div>
      <div className="tender-foot">
        <span className={`chip ${p.role === 'mandataire' ? 'muted' : 'award'}`} title={p.roleNote}>{ROLE_LABELS[p.role]}</span>
        {p.covers.map((c) => <span key={c} className="chip gap">{c}</span>)}
        {p.coBids.length > 0 && <span className="chip muted">{p.coBids.length} joint bid{p.coBids.length > 1 ? 's' : ''}</span>}
        {p.network?.member && <span className="chip go">On Radar</span>}
      </div>
      <p className="small">{p.why}</p>
      {cobid && (
        <p className="small muted">
          Bid with {cobid.partners.slice(0, 3).join(', ')}{cobid.leader ? ' (as lead)' : ''} on{' '}
          {cobid.url ? <a href={cobid.url} target="_blank" rel="noreferrer" lang="fr">{cobid.title}</a> : <span lang="fr">{cobid.title}</span>}
        </p>
      )}
      {p.evidence.length > 0 && (
        <ul className="small examples">
          {p.evidence.slice(0, 2).map((e) => (
            <li key={e.tenderId}>
              {e.url ? <a href={e.url} target="_blank" rel="noreferrer" lang="fr">{e.title}</a> : <span lang="fr">{e.title}</span>}
              <span className="muted"> · {e.buyer} · {formatDate(e.date)}{e.capability ? ` · ${e.capability}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="partner-actions">
        {invite ? (
          <span className={`chip ${STATUS[invite.status].tone}`}>Invite {STATUS[invite.status].label.toLowerCase()}{invite.response?.score != null ? ` · ${invite.response.score}/100` : ''}</span>
        ) : (
          <button className="btn primary small" onClick={onInvite}>Draft invite</button>
        )}
        {p.contactEmail ? (
          <span className="muted small" title={`Published in TED notice ${p.contactSource}`}>{p.contactEmail}</span>
        ) : (
          <span className="muted small">No contact published on TED</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- compose + draft

function InviteComposer({ finder, partner, onCancel, onCreated }: {
  finder: PartnerFinder;
  partner: PartnerCandidate | null;
  onCancel: () => void;
  onCreated: (invite: PartnerInvite) => void;
}) {
  const [role, setRole] = useState<PartnerRole>(partner?.role ?? 'cotraitant');
  const [need, setNeed] = useState(defaultNeed(finder, partner));
  const [name, setName] = useState('');
  const [email, setEmail] = useState(partner?.contactEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { invite } = await api.createInvite({
        tenderId: finder.tender.id,
        organisationId: partner?.organisationId ?? null,
        partnerName: partner ? undefined : name,
        contactEmail: email || undefined,
        role,
        need,
        fitScore: partner?.score ?? null,
      });
      onCreated(invite);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="composer-head">
        <h3 className="sub-title">Invite {partner?.name ?? 'a partner'}</h3>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel"><Icon name="close" size={16} /></button>
      </div>
      {!partner && (
        <label>
          Company name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
        </label>
      )}
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as PartnerRole)}>
          {(Object.keys(ROLE_LABELS) as PartnerRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        {partner && <span className="muted small">{partner.roleNote}</span>}
      </label>
      <label>
        What you need from them <span className="muted small">(in French, shown to the partner)</span>
        <input value={need} onChange={(e) => setNeed(e.target.value)} required minLength={3} maxLength={500} lang="fr" />
      </label>
      <label>
        Their email <span className="muted small">(optional, you can add it in your mail app)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <div className="composer-actions">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Drafting…' : 'Draft the email'}</button>
        <span className="muted small">Nothing is sent: you review it and send it from your own mailbox.</span>
      </div>
    </form>
  );
}

function InviteDraft({ invite, onClose, onSent }: { invite: PartnerInvite; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState(invite.contactEmail ?? '');
  const [subject, setSubject] = useState(invite.subject);
  const [body, setBody] = useState(invite.body);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = () => api.markInviteSent(invite.id, to || undefined).then(onSent, (err) => setError((err as Error).message));
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copy failed: select the text and copy it manually.');
    }
  };
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="card composer">
      <div className="composer-head">
        <h3 className="sub-title">Email to {invite.partnerName}</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <label>
        To
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="partner@example.fr" />
      </label>
      <label>
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} lang="fr" />
      </label>
      <label>
        Message
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} lang="fr" />
      </label>
      {error && <p className="auth-error">{error}</p>}
      <div className="composer-actions">
        <a className="btn primary" href={mailto} onClick={() => void mark()}>Open in mail app</a>
        <button type="button" className="btn secondary" onClick={() => { void copy('email', `${subject}\n\n${body}`); void mark(); }}>
          {copied === 'email' ? 'Copied' : 'Copy email'}
        </button>
        <button type="button" className="btn ghost" onClick={() => void copy('link', invite.link)}>{copied === 'link' ? 'Copied' : 'Copy response link'}</button>
      </div>
      <p className="muted small">The link opens a short response form for {invite.partnerName}. Responses are scored and show up here and on the Partners page.</p>
    </div>
  );
}

// ---------------------------------------------------------------- invite rows

export function InviteRow({ invite: i, showTender = true, onChange }: { invite: PartnerInvite; showTender?: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const r = i.response;
  const st = STATUS[i.status];
  return (
    <div className="card invite-row">
      <div className="invite-head">
        <Initials name={i.partnerName} size={32} />
        <div className="grow">
          <div className="strong">{i.partnerName}</div>
          <div className="muted small">
            {ROLE_LABELS[i.role]} · <span lang="fr">{i.need}</span>
            {showTender && <> · <Link to={`/tenders/${i.tender.id}`} lang="fr">{i.tender.title}</Link></>}
          </div>
          <div className="muted small timeline-line">
            Drafted {formatDate(i.createdAt)}
            {i.sentAt && <> · sent {formatDate(i.sentAt)}</>}
            {i.openedAt && <> · opened {formatDate(i.openedAt)}</>}
            {i.respondedAt && <> · answered {formatDate(i.respondedAt)}</>}
          </div>
        </div>
        <span className={`chip ${st.tone}`}>{st.label}</span>
        {r?.score != null && <ScoreRing score={r.score} size={40} />}
      </div>

      {r ? (
        <>
          <div className="tender-foot">
            <span className={`chip ${r.interest === 'yes' ? 'go' : r.interest === 'maybe' ? 'consider' : 'nogo'}`}>
              {r.interest === 'yes' ? 'Interested' : r.interest === 'maybe' ? 'Maybe' : 'Declined'}
            </span>
            {r.joinedRadar && <span className="chip go">Joined Radar</span>}
            {r.breakdown?.verified.references.some((v) => v.matched) && <span className="chip award">References checked on TED</span>}
            <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide response' : 'Show response'}</button>
          </div>
          {open && <ResponseDetail invite={i} />}
        </>
      ) : (
        <div className="tender-foot">
          {i.status === 'draft' && <span className="muted small">Not sent yet.</span>}
          <button className="btn ghost small" onClick={() => setDraft(!draft)}>{draft ? 'Hide email' : 'Email & link'}</button>
          <button
            className="btn ghost small"
            onClick={() => api.deleteInvite(i.id).then(onChange, (err) => alert((err as Error).message))}
          >
            Delete
          </button>
        </div>
      )}
      {draft && !r && <InviteDraft invite={i} onClose={() => setDraft(false)} onSent={onChange} />}
    </div>
  );
}

function ResponseDetail({ invite }: { invite: PartnerInvite }) {
  const r = invite.response!;
  return (
    <div className="response">
      <p className="muted small">Written by the partner: claims, except where checked against TED.</p>
      <dl className="facts">
        {r.companyName && <><dt>Company</dt><dd>{r.companyName}{r.siret ? ` · SIRET ${r.siret}` : ''}</dd></>}
        {(r.contactName || r.contactEmail) && <><dt>Contact</dt><dd>{[r.contactName, r.contactEmail].filter(Boolean).join(' · ')}</dd></>}
        {r.website && <><dt>Website</dt><dd>{r.website}</dd></>}
        {r.role && <><dt>Proposed role</dt><dd>{ROLE_LABELS[r.role]}</dd></>}
        {r.availability && <><dt>Availability</dt><dd lang="fr">{r.availability}</dd></>}
        {r.capabilities && <><dt>Capabilities</dt><dd lang="fr" className="prose">{r.capabilities}</dd></>}
        {r.message && <><dt>Message</dt><dd lang="fr" className="prose">{r.message}</dd></>}
      </dl>
      {r.references.length > 0 && (
        <>
          <h4 className="small strong">References</h4>
          <ul className="small examples">
            {r.references.map((ref, k) => {
              const v = r.breakdown?.verified.references[k];
              return (
                <li key={k}>
                  <span lang="fr">{ref.title}</span>
                  <span className="muted">{ref.buyer ? ` · ${ref.buyer}` : ''}{ref.year ? ` · ${ref.year}` : ''}</span>
                  {v?.matched ? (
                    <> · <a href={v.matched.url ?? undefined} target="_blank" rel="noreferrer" className="chip award">matches a TED award</a></>
                  ) : (
                    <span className="muted"> · not found on TED</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {r.breakdown && (
        <div className="bars">
          {r.breakdown.parts.map((p) => (
            <div key={p.key} className="bar-row score-part">
              <span className="bar-label small">{p.label}</span>
              <span className="bar-track"><span style={{ width: `${(p.points / p.max) * 100}%` }} /></span>
              <span className="bar-num small">{p.points}/{p.max}</span>
              <span className="muted small bar-note">{p.note}</span>
            </div>
          ))}
          <p className="muted small">Response score is a heuristic for triage (interest, fit to your need, references, identity, speed), not a guarantee.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page

export function PartnersPage() {
  const invites = useApi(() => api.invites(), []);
  if (invites.loading && !invites.data) return <Loading />;
  if (invites.error || !invites.data) return <ErrorState message={invites.error ?? 'Could not load invites'} />;
  const all = invites.data;
  const sent = all.filter((i) => i.sentAt || i.openedAt || i.respondedAt);
  const responded = all.filter((i) => i.response);
  const interested = responded.filter((i) => i.response!.interest !== 'no');
  const scores = interested.map((i) => i.response!.score ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Partners"
        title="Your groupement pipeline"
        subtitle="Firms you invited to co-bid, what they answered, and how their answers score. Partners who respond can open their own Radar, so every invite grows the network."
        actions={<AskButton variant="secondary" label="Who answered?" prompt="Summarise the partner responses we've received: who is interested, how they score and what still needs checking." />}
      />
      <div className="stats">
        <Stat label="Invites" value={all.length} hint={`${all.length - sent.length} draft${all.length - sent.length === 1 ? '' : 's'}`} />
        <Stat label="Opened" value={all.filter((i) => i.openedAt).length} hint={sent.length ? `of ${sent.length} sent` : undefined} />
        <Stat label="Interested" value={interested.length} hint={`${responded.length} response${responded.length === 1 ? '' : 's'}`} />
        <Stat label="Best response" value={scores.length ? `${Math.max(...scores)}/100` : '—'} />
      </div>
      {all.length === 0 ? (
        <Empty>
          No invites yet. Open a <Link to="/tenders">tender</Link> and use the partner finder to see who could fill your gaps.
        </Empty>
      ) : (
        <div className="invite-list">
          {all.map((i) => <InviteRow key={i.id} invite={i} onChange={invites.reload} />)}
        </div>
      )}
      <PartnerBacktestCard />
    </>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

/** The partner finder replayed on real joint bids, against two naive baselines. */
function PartnerBacktestCard() {
  const state = useApi(() => api.partnerBacktest(), []);
  if (state.loading && !state.data) return null;
  if (state.error) return <ErrorState message={`Partner backtest: ${state.error}`} />;
  const bt: PartnerBacktest | null = state.data ?? null;
  return (
    <section className="card">
      <h2 className="section-title">Partner finder backtest</h2>
      <p className="muted small">
        Would Radar have found the real partner? Each case is a real joint bid on a French IT award notice: the lead firm plays you,
        and every method only sees data published before the bid.
      </p>
      {!bt ? (
        <p className="muted">The backtest runs in the background after startup.</p>
      ) : (
        <>
          <table className="small backtest-table">
            <thead>
              <tr><th scope="col">Method</th><th scope="col">Real partner in top 3</th><th scope="col">In top 10</th></tr>
            </thead>
            <tbody>
              {([
                ['Radar partner finder', bt.radar],
                ['Most frequent winners in the CPV area', bt.baselineWinners],
                ['Most frequent joint bidders', bt.baselineJointBidders],
              ] as const).map(([label, h]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{h.top3}/{bt.cases} ({pct(h.top3, bt.cases)})</td>
                  <td>{h.top10}/{bt.cases} ({pct(h.top10, bt.cases)})</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            {bt.cases} joint bids, {bt.avgPartners} partners each on average. A real partner had any earlier TED record in {bt.findable} of them,
            which caps every method. Median {bt.medianMs} ms per shortlist. Run {formatDate(bt.ranAt)}.
          </p>
          <ul className="small muted notes">{bt.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
    </section>
  );
}
