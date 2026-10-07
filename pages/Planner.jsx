import React, { useState } from 'react';
import { api } from '../lib/api.js';

const QUICK = [
  { title: 'PARTY', items: ['Party Hits','Sing-Alongs','Dance Floor','Group Dances','Current Hits'] },
  { title: 'GENRES', items: ['Rock','Country','Hip-Hop','R&B','Latin','Disco / Funk','Pop','EDM','80s','90s','2000s'] },
  { title: 'WEDDING', items: ['First Dance','Father–Daughter','Mother–Son','Grand Entrance','Cake Cutting','Bouquet Toss','Last Dance','Anniversary Dance'] },
  { title: 'EVENTS', items: ['Birthday','Wedding','Corporate','School','Quinceañera','Bar / Club','Festival','Holiday'] },
];

const EXAMPLES = [
  '150-person wedding in Houston, mostly 30–50. Bride loves country and 2000s pop. Groom likes classic rock and hip-hop. Keep it fun, not too clubby.',
  '4-hour 40th birthday party. Mixed crowd, heavy 90s and 2000s, R&B, hip-hop and dance. I need a huge final hour.',
  'Texas wedding with guests from 20 to 70. Country, 80s, 90s, sing-alongs and some Latin. Help me build the night.',
];

export default function Planner() {
  const [event, setEvent] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(value = event) {
    const text = String(value || '').trim();
    if (!text || busy) return;
    setEvent(text); setBusy(true); setError(''); setPlan(null);
    try {
      const { plan: result } = await api.aiEventPlan(text);
      setPlan(result);
    } catch (e) {
      setError(e.code === 'ai_not_configured'
        ? 'AI is not connected yet. Add OPENAI_API_KEY in Hostinger environment variables.'
        : e.code === 'rate_limited' ? 'Too many planner requests. Try again in a few minutes.'
        : 'The planner could not build that plan. Try a little more event detail.');
    } finally { setBusy(false); }
  }

  return (
    <div className="planner">
      <section className="planner-hero">
        <span className="eyebrow">DJ REQUEST LIVE · MUSIC INTELLIGENCE</span>
        <h1>Plan the night.<br /><span>Play with confidence.</span></h1>
        <p>Tell DJ Request Live what kind of event you’re working. The planner turns it into a DJ-ready music strategy, timeline, crowd profile and special moments.</p>
      </section>

      <section className="planner-box panel">
        <div className="planner-box-head">
          <div><h2>AI Event Music Planner</h2><p className="hint">Describe the event like you’d describe it to another DJ.</p></div>
          <span className="ai-pill">AI</span>
        </div>
        <textarea
          className="input planner-input"
          value={event}
          onChange={e => setEvent(e.target.value)}
          placeholder="Example: 150-person wedding in Houston, ages 25–65. Bride loves country and 2000s pop. Groom likes rock and hip-hop. Need a packed dance floor without getting too clubby."
          maxLength={2500}
        />
        <div className="planner-actions">
          <button className="btn btn-gold" disabled={!event.trim() || busy} onClick={() => run()}>
            {busy ? 'Building your plan…' : 'Build My Event Plan →'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setEvent(''); setPlan(null); setError(''); }}>Clear</button>
        </div>
        {error && <div className="msg err">{error}</div>}
        <div className="examples"><span>Try:</span>{EXAMPLES.map(x => <button key={x} onClick={() => { setEvent(x); run(x); }}>{x}</button>)}</div>
      </section>

      <section className="quick panel">
        <div className="planner-box-head"><div><h2>Quick Reference</h2><p className="hint">Start with a category instead of typing.</p></div></div>
        {QUICK.map(group => (
          <div className="quick-group" key={group.title}>
            <b>{group.title}</b>
            <div className="quick-grid">{group.items.map(item => <button key={item} onClick={() => { setEvent(item); run(item); }}>{item}</button>)}</div>
          </div>
        ))}
      </section>

      {plan && <PlanResult plan={plan} onRefine={run} busy={busy} />}
    </div>
  );
}

function PlanResult({ plan, onRefine, busy }) {
  const [refine, setRefine] = useState('');
  return (
    <section className="planner-result">
      <div className="result-head">
        <div><span className="eyebrow">EVENT PLAN</span><h2>{plan.title}</h2><p>{plan.summary}</p></div>
        <span className="result-badge">DJ READY</span>
      </div>
      <div className="result-grid">
        <ResultCard title="Crowd profile"><p>{plan.crowd_profile}</p></ResultCard>
        <ResultCard title="Music mix">
          <div className="mix">{(plan.music_mix || []).map(x => <div key={x.label}><span>{x.label}</span><b>{x.percent}%</b><i><em style={{ width: x.percent + '%' }} /></i></div>)}</div>
        </ResultCard>
        <ResultCard title="Night strategy">
          <ol className="timeline">{(plan.timeline || []).map(x => <li key={x.phase}><b>{x.phase}</b><span>{x.direction}</span></li>)}</ol>
        </ResultCard>
        <ResultCard title="Special moments">
          <ul className="specials">{(plan.special_moments || []).map(x => <li key={x.moment}><b>{x.moment}</b><span>{x.music_direction}</span></li>)}</ul>
        </ResultCard>
      </div>
      <div className="refine panel">
        <b>Refine the plan</b>
        <div className="refine-row"><input className="input" value={refine} onChange={e => setRefine(e.target.value)} placeholder="Make it 20% more country. Less hip-hop. They're mostly in their 40s." /><button className="btn btn-gold" disabled={!refine.trim() || busy} onClick={() => { onRefine(refine); setRefine(''); }}>Refine →</button></div>
      </div>
      <p className="planner-note">Phase 1 builds the event strategy. The curated DJRequestLive track library comes next, so song recommendations are grounded in our DJ database instead of invented by AI.</p>
    </section>
  );
}

function ResultCard({ title, children }) {
  return <article className="result-card"><h3>{title}</h3>{children}</article>;
}
