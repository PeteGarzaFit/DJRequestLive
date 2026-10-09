import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import './wedding-planner.css';

function ActionButton({ children, onClick, kind = '' }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (busy) return;
    setBusy(true);
    try { await onClick(); } finally { setBusy(false); }
  }
  return <button type="button" className={`wp-button ${kind || 'wp-button-dark'}`} disabled={busy} onClick={run} aria-busy={busy}>
    {busy ? <><i className="wp-spinner" aria-hidden="true" /> Creating…</> : children}
  </button>;
}

function displayDate(value) {
  if (!value) return 'Date not set';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function EventPlans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    document.title = 'My Plans · DJ Request Live';
    let active = true;
    Promise.all([api.eventPlans(), api.weddingPlans()])
      .then(([events, weddings]) => {
        if (active) setPlans([
          ...(events.plans || []).map(plan => ({ ...plan, kind: 'event' })),
          ...(weddings.plans || []).map(plan => ({ ...plan, kind: 'wedding' })),
        ]);
      })
      .catch(err => {
        if (!active) return;
        if (err.status === 401) navigate('/login', { replace: true });
        else setError('Could not load your plans. Refresh to try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigate]);

  const shownPlans = useMemo(() => [...plans]
    .filter(plan => filter === 'all' || plan.kind === filter)
    .sort((a, b) => {
      const da = a.plan?.eventDate || '';
      const db = b.plan?.eventDate || '';
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const group = date => date ? (date >= today ? 0 : 2) : 1;
      if (group(da) !== group(db)) return group(da) - group(db);
      return group(da) === 2 ? db.localeCompare(da) : da.localeCompare(db);
    }), [plans, filter]);

  async function createPlan(kind) {
    try {
      const created = kind === 'wedding' ? await api.createWeddingPlan({}) : await api.createEventPlan({});
      navigate(kind === 'wedding' ? `/wedding-planner?id=${encodeURIComponent(created.id)}` : `/event-planner?id=${encodeURIComponent(created.id)}`);
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true });
      else setError(`Could not create a ${kind} planner. Try again.`);
      return false;
    }
    return true;
  }

  return <main className="wedding-app plans-app"><div className="wp-shell">
    <header className="wp-topbar">
      <Link to="/studio?tab=queue" className="wp-wordmark">DJ Request Live <span>My Plans</span></Link>
      <Link className="wp-small-link" to="/studio?tab=queue">Back to Studio</Link>
    </header>
    <section className="wp-hero plans-hero"><div>
      <p className="wp-kicker">One place for every occasion</p>
      <h1>My Plans</h1>
      <p className="wp-lede">Find your saved events and weddings here. Open a plan to continue; changes save as you go.</p>
    </div><div className="plans-create-actions">
      <ActionButton onClick={() => createPlan('event')}>＋ New event</ActionButton>
      <ActionButton kind="wp-button-wedding" onClick={() => createPlan('wedding')}>＋ New wedding</ActionButton>
    </div></section>

    <div className="plans-toolbar"><div className="plans-tabs" role="group" aria-label="Filter plans">
      {[['all', 'All plans'], ['event', 'Events'], ['wedding', 'Weddings']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
    </div><span>{shownPlans.length} {shownPlans.length === 1 ? 'plan' : 'plans'}</span></div>
    {error && <p className="plans-message" role="alert">{error}</p>}
    {loading ? <div className="wp-loading" role="status">Loading your plans…</div> : shownPlans.length ?
      <section className="plans-grid" aria-label="Saved plans">
        {shownPlans.map(item => {
          const plan = item.plan || {};
          const wedding = item.kind === 'wedding';
          const id = item.id;
          const title = wedding
            ? plan.title || [plan.couple?.bride, plan.couple?.groom].filter(Boolean).join(' & ') || `Wedding ${id}`
            : plan.title || `Event ${id}`;
          const href = wedding ? `/wedding-planner?id=${encodeURIComponent(id)}` : `/event-planner?id=${encodeURIComponent(id)}`;
          return <article className={`plans-card ${wedding ? 'wedding' : 'event'}`} key={`${item.kind}-${id}`}>
            <div className="plans-card-top"><span>{displayDate(plan.eventDate)}</span><span className={`plans-type ${wedding ? 'wedding' : 'event'}`}>{wedding ? 'Wedding' : plan.eventType || 'Event'}</span></div>
            <h2>{title}</h2>
            <p>{[plan.venue?.name, plan.venue?.address].filter(Boolean).join(' · ') || 'Venue not set'}</p>
            <Link className="wp-button wp-button-light" to={href}>Open planner <span aria-hidden="true">→</span></Link>
          </article>;
        })}
      </section> : <section className="plans-empty">
        <div className="plans-empty-icon" aria-hidden="true">♫</div>
        <h2>{filter === 'all' ? 'No plans yet' : `No ${filter === 'event' ? 'events' : 'weddings'} yet`}</h2>
        <p>Create your first planner here. You can fill it in now and return to My Plans any time.</p>
        <div className="plans-create-actions"><ActionButton onClick={() => createPlan('event')}>＋ Create event planner</ActionButton><ActionButton kind="wp-button-wedding" onClick={() => createPlan('wedding')}>＋ Create wedding planner</ActionButton></div>
      </section>}
  </div></main>;
}
