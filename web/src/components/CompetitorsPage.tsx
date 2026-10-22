import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api';
import { AskButton, Empty, ErrorState, formatDate, formatEur, Icon, Initials, Loading, PageHeader, useApi, useDebounced } from './ui';

export function CompetitorsPage() {
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const { data, mock, loading, error } = useApi(() => api.competitors({ q: query, limit: 100 }), [query]);
  const navigate = useNavigate();
  const rows = data ?? [];
  const maxValue = Math.max(1, ...rows.map((c) => c.totalValue ?? 0));

  return (
    <>
      <PageHeader
        eyebrow="Competitors"
        title="Who wins in your market"
        subtitle="Companies that have won comparable French public IT contracts, from TED award notices."
        mock={mock}
        actions={<AskButton variant="secondary" label="Summarise the field" prompt="Summarise our competitive landscape: which firms win the most contracts like ours, with which buyers, and where are they weakest?" />}
      />

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search competitors" />
        </label>
      </div>

      {loading && !data && <Loading label="Loading competitors…" />}
      {data && (
        <p className="muted small">
          {query ? `${rows.length} matching “${query}”` : `Top ${rows.length} by contracts won`}. Frameworks award many winners at once, so
          compare wins with the number of distinct buyers.
        </p>
      )}
      {error && <ErrorState message={error} />}
      {data && rows.length === 0 && <Empty>No competitors found{query && ` for “${query}”`}.</Empty>}

      {rows.length > 0 && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table hover">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="num">Wins</th>
                  <th className="num">Buyers</th>
                  <th>Total value won</th>
                  <th>Last win</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/competitors/${c.id}`)}>
                    <td>
                      <div className="name-cell">
                        <Initials name={c.name} size={32} />
                        <div>
                          <Link to={`/competitors/${c.id}`} className="strong" onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                          {c.website && <div className="muted small">{c.website.replace(/^https?:\/\/(www\.)?/, '')}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="num strong">{c.wins}</td>
                    <td className="num">{c.buyers ?? '—'}</td>
                    <td>
                      <div className="bar-cell">
                        <div className="bar"><span style={{ width: `${((c.totalValue ?? 0) / maxValue) * 100}%` }} /></div>
                        <span className="nowrap">{formatEur(c.totalValue, true)}</span>
                      </div>
                    </td>
                    <td className="nowrap">{formatDate(c.lastWin)}</td>
                    <td className="num muted">→</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
