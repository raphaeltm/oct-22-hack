import { api } from '../api';
import { AskButton, ErrorState, Initials, Loading, PageHeader, useApi } from './ui';

type PastWin = { title?: string; buyer?: string; year?: number; value?: string };

/** "typicalContractSize" -> "Typical contract size" */
function humanise(key: string) {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function winLabel(w: unknown) {
  const win = (typeof w === 'object' && w ? w : {}) as PastWin;
  if (typeof win.title !== 'string') return { title: text(w), meta: '' };
  return { title: win.title, meta: [win.buyer, win.year, win.value].filter(Boolean).join(' · ') };
}

function Tags({ items, mono }: { items: unknown[]; mono?: boolean }) {
  return (
    <div className="tags">
      {items.length ? (
        items.map((s, i) => <span key={`${text(s)}-${i}`} className={mono ? 'tag mono' : 'tag'}>{text(s)}</span>)
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  );
}

/** Facts the agent saved in companies.profile (past wins, competitors, certifications, ...). */
function ProfileFacts({ profile }: { profile: Record<string, unknown> }) {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const pastWins = list(profile.pastWins);
  const knownCompetitors = list(profile.knownCompetitors);
  const certifications = list(profile.certifications);
  const other = Object.entries(profile).filter(
    ([k, v]) => !['pastWins', 'knownCompetitors', 'certifications'].includes(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length),
  );

  return (
    <>
      <div className="profile-grid">
        <div>
          <h3 className="sub-title">Certifications</h3>
          <Tags items={certifications} />
        </div>
        <div>
          <h3 className="sub-title">Known competitors</h3>
          <Tags items={knownCompetitors} />
        </div>
      </div>

      <h3 className="sub-title">Past wins</h3>
      {pastWins.length ? (
        <ul className="checks">
          {pastWins.map((w, i) => {
            const { title, meta } = winLabel(w);
            return (
              <li key={`${title}-${i}`}>
                {title}
                {meta && <span className="muted"> — {meta}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="muted">—</span>
      )}

      {other.length > 0 && (
        <div className="profile-grid">
          {other.map(([k, v]) => (
            <div key={k}>
              <h3 className="sub-title">{humanise(k)}</h3>
              {Array.isArray(v) ? <Tags items={v} /> : <div>{text(v)}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function CompanyPage() {
  const { data, mock, loading, error } = useApi(() => api.me(), []);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load profile'} />;

  const c = data.company;
  if (!c) {
    return (
      <>
        <PageHeader eyebrow="Company" title="Company profile" mock={mock} />
        <section className="card empty-card">
          <h2>No company profile yet</h2>
          <p className="muted">
            The agent uses your profile to score tenders and pick out competitors. Tell it what you do, where you work and
            who you sell to.
          </p>
          <AskButton
            label="Set up with the agent"
            prompt="Help me set up our company profile. Ask me about our services, team size, regions, target buyers and differentiators, then save it."
          />
        </section>
      </>
    );
  }

  const groups: [string, string[]][] = [
    ['Services', c.services],
    ['Sectors', c.sectors],
    ['Regions', c.regions],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Company profile"
        subtitle="What the agent knows about you. Used to score tenders and find competitors."
        mock={mock}
        actions={
          <AskButton
            variant="secondary"
            label="Update via chat"
            prompt={`Let's update the company profile for ${c.name}. Show me what you have, then ask what's changed.`}
          />
        }
      />

      <section className="card profile">
        <div className="profile-head">
          <Initials name={c.name} size={56} />
          <div>
            <h2>{c.name}</h2>
            {c.size && <div className="muted">{c.size}</div>}
          </div>
        </div>
        {c.description && <p className="prose" lang="fr">{c.description}</p>}

        <div className="profile-grid">
          {groups.map(([label, items]) => (
            <div key={label}>
              <h3 className="sub-title">{label}</h3>
              <div className="tags">
                {items.length ? items.map((s) => <span key={s} className="tag">{s}</span>) : <span className="muted">—</span>}
              </div>
            </div>
          ))}
          <div>
            <h3 className="sub-title">CPV codes</h3>
            <div className="tags">
              {c.cpvCodes.length ? c.cpvCodes.map((s) => <span key={s} className="tag mono">{s}</span>) : <span className="muted">—</span>}
            </div>
          </div>
        </div>

        {c.differentiators.length > 0 && (
          <>
            <h3 className="sub-title">Differentiators</h3>
            <ul className="checks">
              {c.differentiators.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </>
        )}

        <ProfileFacts profile={c.profile ?? {}} />
      </section>
    </>
  );
}
