// Public, token-scoped page where an invited firm answers a co-bidding invite
// (/p/:token), plus /join/:token where a signed-in partner opens their own Radar.
// The partner is a French firm, so this page is in French.
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type PartnerResponseInput, type PartnerRole, type PublicInvite } from '../api';
import { formatEur } from './ui';

const ROLE_FR: Record<PartnerRole, string> = {
  cotraitant: 'Cotraitant (ils seraient mandataires)',
  'sous-traitant': 'Sous-traitant',
  mandataire: 'Mandataire (vous menez le groupement)',
};

const frDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'non précisée';

type Ref = { title: string; buyer: string; year: string };

export function PartnerRespondPage() {
  const { token = '' } = useParams();
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.publicInvite(token).then(setInvite, (err: Error) => setLoadError(err.message));
  }, [token]);

  return (
    <div className="public-page">
      <header className="public-head">
        <Link to="/" className="auth-brand" aria-label="Radar">
          <span className="brand-icon">◈</span>
          <span className="brand-name">radar<span className="brand-dot">.</span></span>
        </Link>
      </header>
      <main className="public-main">
        {!invite && !loadError && <p className="empty">Chargement…</p>}
        {loadError && (
          <div className="card public-card">
            <h1>Invitation introuvable</h1>
            <p className="muted">Ce lien n’est pas valide ou a expiré. Contactez directement l’entreprise qui vous l’a envoyé.</p>
          </div>
        )}
        {invite && (
          <>
            <div className="card public-card">
              <p className="eyebrow">Proposition de groupement</p>
              <h1>{invite.from.name} souhaite répondre avec {invite.partnerName}</h1>
              <dl className="facts">
                <dt>Consultation</dt>
                <dd>{invite.tender.url ? <a href={invite.tender.url} target="_blank" rel="noreferrer">{invite.tender.title}</a> : invite.tender.title}</dd>
                <dt>Acheteur</dt>
                <dd>{invite.tender.buyerName ?? 'non précisé'}</dd>
                <dt>Date limite</dt>
                <dd>{frDate(invite.tender.deadlineAt)}</dd>
                {invite.tender.estimatedValue != null && (<><dt>Montant estimé</dt><dd>{formatEur(invite.tender.estimatedValue)}</dd></>)}
                <dt>Besoin</dt>
                <dd>{invite.need}</dd>
                <dt>Rôle proposé</dt>
                <dd>{ROLE_FR[invite.role]}</dd>
              </dl>
              <p className="muted small">Avis TED {invite.tender.publicationNumber}. {invite.from.name} a trouvé votre entreprise via vos marchés publics attribués, publiés sur TED.</p>
            </div>
            {invite.expired ? (
              <div className="card public-card"><p>Cette invitation a expiré.</p></div>
            ) : invite.responded || done ? (
              <Thanks token={token} from={invite.from.name} />
            ) : (
              <ResponseForm token={token} invite={invite} onDone={() => setDone(true)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ResponseForm({ token, invite, onDone }: { token: string; invite: PublicInvite; onDone: () => void }) {
  const [interest, setInterest] = useState<'yes' | 'maybe' | 'no'>('yes');
  const [role, setRole] = useState<PartnerRole>(invite.role);
  const [f, setF] = useState({ companyName: invite.partnerName, siret: '', contactName: '', contactEmail: '', website: '', capabilities: '', availability: '', message: '' });
  const [refs, setRefs] = useState<Ref[]>([{ title: '', buyer: '', year: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const declined = interest === 'no';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input: PartnerResponseInput = {
      interest,
      role: declined ? null : role,
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])),
      references: declined ? [] : refs.filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), buyer: r.buyer.trim() || undefined, year: r.year.trim() || undefined })),
    };
    try {
      await api.respondToInvite(token, input);
      onDone();
    } catch (err) {
      const x = err as Error & { issues?: string[] };
      setError(x.issues?.length ? `${x.message} : ${x.issues.join(' ; ')}` : x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card public-card public-form" onSubmit={submit}>
      <h2>Votre réponse</h2>
      <fieldset className="segmented-field">
        <legend>Êtes-vous intéressé ?</legend>
        {(['yes', 'maybe', 'no'] as const).map((v) => (
          <label key={v} className={`radio-pill ${interest === v ? 'on' : ''}`}>
            <input type="radio" name="interest" value={v} checked={interest === v} onChange={() => setInterest(v)} />
            {v === 'yes' ? 'Oui' : v === 'maybe' ? 'Peut-être' : 'Non, merci'}
          </label>
        ))}
      </fieldset>

      {!declined && (
        <>
          <div className="form-grid">
            <label>Entreprise<input value={f.companyName} onChange={set('companyName')} maxLength={200} required /></label>
            <label>SIRET<input value={f.siret} onChange={set('siret')} maxLength={20} inputMode="numeric" placeholder="14 chiffres" /></label>
            <label>Votre nom<input value={f.contactName} onChange={set('contactName')} maxLength={120} autoComplete="name" /></label>
            <label>Email<input type="email" value={f.contactEmail} onChange={set('contactEmail')} maxLength={200} autoComplete="email" /></label>
            <label>Site web<input value={f.website} onChange={set('website')} maxLength={300} placeholder="https://" /></label>
            <label>
              Rôle souhaité
              <select value={role} onChange={(e) => setRole(e.target.value as PartnerRole)}>
                {(Object.keys(ROLE_FR) as PartnerRole[]).map((r) => <option key={r} value={r}>{ROLE_FR[r]}</option>)}
              </select>
            </label>
          </div>
          <label>
            Ce que vous apportez sur ce besoin
            <textarea value={f.capabilities} onChange={set('capabilities')} rows={4} maxLength={3000} placeholder="Compétences, certifications, équipe…" />
          </label>
          <label>
            Disponibilité
            <input value={f.availability} onChange={set('availability')} maxLength={500} placeholder="Ex. 2 consultants à partir de janvier" />
          </label>
          <div className="refs">
            <span className="label">Références comparables (marchés publics de préférence)</span>
            {refs.map((r, i) => (
              <div key={i} className="ref-row">
                <input aria-label={`Référence ${i + 1} : intitulé`} placeholder="Intitulé du marché" value={r.title} maxLength={300}
                  onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input aria-label={`Référence ${i + 1} : acheteur`} placeholder="Acheteur" value={r.buyer} maxLength={200}
                  onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, buyer: e.target.value } : x)))} />
                <input aria-label={`Référence ${i + 1} : année`} placeholder="Année" value={r.year} maxLength={10} className="year"
                  onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} />
              </div>
            ))}
            {refs.length < 5 && (
              <button type="button" className="btn ghost small" onClick={() => setRefs([...refs, { title: '', buyer: '', year: '' }])}>+ Ajouter une référence</button>
            )}
          </div>
        </>
      )}
      <label>
        Message {declined && '(facultatif)'}
        <textarea value={f.message} onChange={set('message')} rows={3} maxLength={3000} />
      </label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer ma réponse'}</button>
      <p className="muted small">Votre réponse est transmise uniquement à {invite.from.name}. Vos références sont rapprochées des avis d’attribution publiés sur TED.</p>
    </form>
  );
}

function Thanks({ token, from }: { token: string; from: string }) {
  return (
    <div className="card public-card thanks">
      <h2>Merci, votre réponse a été transmise à {from}.</h2>
      <p>
        Radar repère chaque semaine les appels d’offres publics IT qui correspondent à votre activité, vos concurrents probables et les
        partenaires avec qui répondre. Créez votre compte pour recevoir vos propres opportunités : votre profil est pré-rempli avec votre réponse.
      </p>
      <Link className="btn primary" to={`/login?mode=signup&next=${encodeURIComponent(`/join/${token}`)}`}>Créer mon radar gratuit</Link>
    </div>
  );
}

/** /join/:token (signed in): link the response to the account and seed the company profile. */
export function JoinFromInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.claimInvite(token).then(
      () => navigate('/company', { replace: true }),
      (err: Error) => setError(err.message),
    );
  }, [token, navigate]);
  return (
    <div className="public-page">
      <main className="public-main">
        <div className="card public-card">
          {error ? (
            <>
              <h1>Impossible de lier cette réponse</h1>
              <p className="muted">{error}</p>
              <Link className="btn primary" to="/tenders">Continuer vers Radar</Link>
            </>
          ) : (
            <p>Création de votre profil…</p>
          )}
        </div>
      </main>
    </div>
  );
}
