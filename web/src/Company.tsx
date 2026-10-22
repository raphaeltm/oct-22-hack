import { FormEvent, useEffect, useState } from 'react';
import { api, countryName, money, type Company as CompanyT, type PastBid, type ProfileDraft } from './api';

const toDraft = (c: CompanyT): ProfileDraft => ({
  name: c.name,
  pitch: c.pitch,
  cpv: c.cpv,
  countries: c.countries,
  keywords: c.keywords,
  minValue: c.min_value,
  maxValue: c.max_value,
});

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function CompanyPage({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [company, setCompany] = useState<CompanyT | null>(null);
  const [bids, setBids] = useState<PastBid[]>([]);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () =>
    api.company(companyId).then((r) => {
      setCompany(r.company);
      setBids(r.pastBids);
      setDraft(toDraft(r.company));
    });
  useEffect(() => {
    void load();
  }, [companyId]);

  if (!company || !draft) return <div className="page">Loading…</div>;

  async function save(e: FormEvent) {
    e.preventDefault();
    await api.updateCompany(companyId, draft!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    onSaved();
  }

  return (
    <div className="page company">
      <section className="learned">
        <h2>What the radar has learned about you</h2>
        {company.learned_rules ? (
          <ul className="rules">
            {company.learned_rules
              .split('\n')
              .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
              .filter(Boolean)
              .map((l, i) => (
                <li key={i}>{l}</li>
              ))}
          </ul>
        ) : (
          <p className="muted">Nothing yet. Each time you bid on a tender or pass on one, the radar turns your reasons into rules and uses them in every score after that.</p>
        )}
      </section>

      <form className="card" onSubmit={save}>
        <h2>Profile</h2>
        <ProfileFields draft={draft} setDraft={setDraft} />
        <div className="form-actions">
          <button className="btn btn-ink" type="submit">
            Save profile
          </button>
          {saved && <span className="muted">Saved. The next sweep uses it.</span>}
        </div>
      </form>

      <section className="card">
        <h2>Track record</h2>
        <p className="muted">Past bids, won and lost. The radar compares every new tender against these.</p>
        <table className="bids">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Buyer</th>
              <th>Year</th>
              <th>Value</th>
              <th>Result</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {bids.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.title}</strong>
                  <span className="muted bid-sum">{b.summary}</span>
                </td>
                <td>{b.buyer}</td>
                <td>{b.year ?? '—'}</td>
                <td>{money(b.value)}</td>
                <td>
                  <span className={`chip chip-${b.outcome === 'won' ? 'go' : 'no-go'}`}>{b.outcome === 'won' ? 'Won' : 'Lost'}</span>
                </td>
                <td>
                  <button className="link" onClick={() => api.deleteBid(companyId, b.id).then(load)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <AddBid companyId={companyId} onAdded={load} />
      </section>
    </div>
  );
}

export function ProfileFields({ draft, setDraft }: { draft: ProfileDraft; setDraft: (d: ProfileDraft) => void }) {
  const set = (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="fields">
      <label>
        Company name
        <input value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
      </label>
      <label className="span2">
        What you do
        <textarea rows={3} value={draft.pitch} onChange={(e) => set({ pitch: e.target.value })} />
      </label>
      <label>
        CPV codes <span className="hint">comma separated, 8 digits</span>
        <input value={draft.cpv.join(', ')} onChange={(e) => set({ cpv: splitList(e.target.value) })} />
        {draft.cpvLabels && <span className="hint">{draft.cpv.map((c, i) => `${c} ${draft.cpvLabels?.[i] ?? ''}`).join(' · ')}</span>}
      </label>
      <label>
        Countries <span className="hint">ISO codes, e.g. FRA, BEL</span>
        <input value={draft.countries.join(', ')} onChange={(e) => set({ countries: splitList(e.target.value).map((x) => x.toUpperCase()) })} />
        <span className="hint">{draft.countries.map(countryName).join(', ')}</span>
      </label>
      <label className="span2">
        Search keywords <span className="hint">any language, comma separated</span>
        <input value={draft.keywords.join(', ')} onChange={(e) => set({ keywords: splitList(e.target.value) })} />
      </label>
      <label>
        Smallest contract worth bidding (€)
        <input type="number" value={draft.minValue ?? ''} onChange={(e) => set({ minValue: e.target.value ? Number(e.target.value) : null })} />
      </label>
      <label>
        Largest contract you can deliver (€)
        <input type="number" value={draft.maxValue ?? ''} onChange={(e) => set({ maxValue: e.target.value ? Number(e.target.value) : null })} />
      </label>
    </div>
  );
}

function AddBid({ companyId, onAdded }: { companyId: string; onAdded: () => void }) {
  const empty = { title: '', buyer: '', year: new Date().getFullYear(), value: null as number | null, outcome: 'won' as const, summary: '' };
  const [b, setB] = useState<Omit<PastBid, 'id'>>(empty);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="link add-bid" onClick={() => setOpen(true)}>
        + Add a past bid
      </button>
    );
  return (
    <form
      className="fields add-bid-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await api.addBid(companyId, b);
        setB(empty);
        setOpen(false);
        onAdded();
      }}
    >
      <label className="span2">
        Contract
        <input value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} required />
      </label>
      <label>
        Buyer
        <input value={b.buyer} onChange={(e) => setB({ ...b, buyer: e.target.value })} />
      </label>
      <label>
        Year
        <input type="number" value={b.year ?? ''} onChange={(e) => setB({ ...b, year: Number(e.target.value) || null })} />
      </label>
      <label>
        Value (€)
        <input type="number" value={b.value ?? ''} onChange={(e) => setB({ ...b, value: Number(e.target.value) || null })} />
      </label>
      <label>
        Result
        <select value={b.outcome} onChange={(e) => setB({ ...b, outcome: e.target.value as 'won' | 'lost' })}>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
      </label>
      <label className="span2">
        What happened
        <input value={b.summary} onChange={(e) => setB({ ...b, summary: e.target.value })} placeholder="Scope, stack, why you won or lost" />
      </label>
      <div className="form-actions span2">
        <button className="btn btn-ink" type="submit">
          Add bid
        </button>
        <button className="link" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Onboarding: one paragraph in, a full radar profile out. */
export function Onboarding({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel?: () => void }) {
  // Replaces the signed-in user's firm profile (one firm per account).
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setDraft((await api.draftProfile(description)).profile);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const { id } = await api.createCompany(draft!);
      onCreated(id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="page onboarding">
      <h2>{onCancel ? 'Rebuild your firm profile' : 'Tell the radar about your firm'}</h2>
      {!draft ? (
        <form className="card" onSubmit={generate}>
          <label>
            Describe the firm in a few sentences: what it sells, to whom, where, and how big it is.
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="We're a 15-person Lyon studio building accessible websites and mobile apps for universities and local councils in France and Switzerland. Typical projects are €50k–€400k."
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ink" type="submit" disabled={busy || description.trim().length < 20}>
              {busy ? 'Building the profile…' : 'Build the profile'}
            </button>
            {onCancel && (
              <button className="link" type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="card">
          <p className="muted">Here's how the radar will search for this firm. Adjust anything, then start watching.</p>
          <ProfileFields draft={draft} setDraft={setDraft} />
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-ink" onClick={create} disabled={busy}>
              {busy ? 'Starting…' : 'Start watching TED'}
            </button>
            <button className="link" onClick={() => setDraft(null)}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
