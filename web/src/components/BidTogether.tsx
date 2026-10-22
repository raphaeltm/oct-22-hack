// "Bid together" home: the groupement pipeline (Partners.tsx) plus the matched
// tenders worth bidding with a partner, so joint bidding is the first thing a
// signed-in user sees.
import { Link } from 'react-router';
import { api, needsPartner } from '../api';
import { PartnersPage } from './Partners';
import { TenderCard } from './TendersPage';
import { AskButton, daysUntil, Empty, ErrorState, Icon, Loading, PageHeader, useApi } from './ui';

// A groupement takes time to agree (roles, DC1/DC2, pricing), so tenders closing
// sooner than this are listed after the ones there's still time to team up on.
const TEAM_UP_DAYS = 10;

export function BidTogetherPage() {
  const invites = useApi(() => api.invites(), []);
  if (invites.loading && !invites.data) return <Loading />;
  // Once there are invites, the pipeline leads; until then, the tenders to team up on do.
  if (invites.error || invites.data?.length) {
    return (
      <>
        <PartnersPage />
        <TogetherShortlist />
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Bid together"
        title="Win the tenders too big to bid alone"
        subtitle="French buyers let small firms bid as a groupement (co-traitance). Radar finds the tenders where you need a partner, and the firms whose TED awards and past joint bids show they can fill the gap."
      />
      <TogetherShortlist />
      <p className="muted small">
        Partners you invite, their answers and how those answers score will appear here as your groupement pipeline.
      </p>
    </>
  );
}

function TogetherShortlist() {
  const { data, mock, loading, error } = useApi(() => api.matches(), []);
  const timeToTeam = (deadline: string | null) => (daysUntil(deadline) ?? 0) >= TEAM_UP_DAYS;
  const rows = (data ?? [])
    .filter((m) => needsPartner(m.teaming))
    .sort((a, b) => Number(timeToTeam(b.tender.deadline)) - Number(timeToTeam(a.tender.deadline)) || b.score - a.score)
    .slice(0, 6);

  return (
    <section className="together-shortlist">
      <div className="section-head">
        <div>
          <h2 className="section-title"><Icon name="handshake" /> Tenders to bid on together</h2>
          <p className="muted">
            Matched tenders that ask for something your profile doesn't cover, or are large for your size. Open one to see
            who could fill the gap, with their past TED awards and joint bids as evidence.
          </p>
        </div>
        <AskButton
          variant="secondary"
          label="Which groupement first?"
          prompt="Of our matched open tenders, which ones should we bid on as a groupement, and which partner capabilities would we need for each? Cite the TED notices."
        />
      </div>
      {mock && <div className="notice info">These matches are sample data.</div>}
      {loading && !data && <Loading label="Finding tenders to bid together…" />}
      {error && <ErrorState message={error} />}
      {data && rows.length === 0 && (
        <Empty>
          None of your current matches needs a partner. <Link to="/tenders?view=all">Browse all tenders</Link> to find bigger ones.
        </Empty>
      )}
      <ul className="tender-list">
        {rows.map((m) => <TenderCard key={m.tender.id} match={m} />)}
      </ul>
      {data && rows.length > 0 && (
        <Link to="/tenders?together=1" className="btn ghost small">All tenders to bid together →</Link>
      )}
    </section>
  );
}
