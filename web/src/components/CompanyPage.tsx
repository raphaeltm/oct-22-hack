import { api } from '../api';
import { AskButton, ErrorState, Initials, Loading, PageHeader, useApi } from './ui';

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
      </section>
    </>
  );
}
