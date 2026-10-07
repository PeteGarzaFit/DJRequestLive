import React, { useState } from 'react';
import { PAY, clean, money, payLink, handleLabel, requestText } from '../lib/pay.js';
import { themeStyle, tipList, initials } from '../lib/theme.js';
import { toast } from '../lib/toast.js';
import { copyText } from '../lib/api.js';

/* The page a guest sees. Used on the live /their-name route and as the studio's live preview. */
export default function GuestView({ p, preview = false, paused = false, onSend }) {
  const tips = tipList(p);
  const [g, setG] = useState({ song: '', artist: '', from: '', note: '', amt: String(tips[1] || tips[0]), web: '' });
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setG((x) => ({ ...x, [k]: e.target.value }));

  const genres = String(p.g || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ig = clean(p.ig);
  const vinylOn = !(p.v === 0 || p.v === '0' || p.v === false);
  const photos = (p.ph || []).filter(Boolean).slice(0, 3);
  const methods = PAY.filter((x) => clean(p[x.k]));
  const amt = +g.amt > 0 ? Math.round(+g.amt * 100) / 100 : 0;
  const belowMin = p.m && amt < +p.m;

  async function pay(x) {
    if (preview) { toast('Preview only. Guests can tap this'); return; }
    if (!g.song.trim()) { toast('Add a song first'); return; }
    if (!amt) { toast('Choose a tip amount'); return; }
    if (belowMin) { toast(`Minimum is ${money(p.m)}`); return; }
    try { if (Date.now() - +localStorage.getItem('rl.last') < 15000) { toast('Hold on a few seconds before sending another'); return; } } catch { /* storage blocked */ }
    setBusy(true);
    const text = requestText(g);
    try {
      await onSend({ song: g.song.trim(), artist: g.artist.trim(), from: g.from.trim(), note: g.note.trim(), tip: amt, method: x.k, website: g.web });
      try { localStorage.setItem('rl.last', String(Date.now())); } catch { /* ignore */ }
      setDone({ k: x.k, amt, text });
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e && e.message || 'Couldn’t send your request. Try again');
    } finally { setBusy(false); }
  }

  const wall = p.wall ? <div className="wall" style={{ backgroundImage: `url('${p.wall}')` }} /> : null;

  if (done) {
    const x = PAY.find((y) => y.k === done.k);
    const link = payLink(done.k, p, done.amt, done.text);
    return (
      <div className="scope" style={themeStyle(p)}>
        {wall}
        <section className="panel done">
          <div className="msg ok">Request sent to {p.n || 'the DJ'}</div>
          <h2 style={{ fontSize: 22 }}>Now send your {money(done.amt)} tip</h2>
          <p className="hint">Pay <b>{handleLabel(done.k, p[done.k])}</b> in {x.name}. Paste this in the note if you can, so the DJ can match it to you:</p>
          <div className="reqcard">{done.text}</div>
          <button className="btn btn-ghost btn-block" onClick={async () => toast((await copyText(done.text)) ? 'Note copied' : 'Couldn’t copy')}>Copy note</button>
          {link
            ? <a className="btn btn-gold btn-block" href={link} target="_blank" rel="noopener noreferrer">Open {x.name} →</a>
            : <>
              <button className="btn btn-gold btn-block" onClick={async () => toast((await copyText(String(p[done.k]))) ? 'Copied' : 'Couldn’t copy')}>Copy {x.name} {done.k === 'zelle' ? 'email / phone' : 'number'}</button>
              <p className="hint">Open your banking app’s Zelle tab{done.k === 'apple' ? ' (or Messages)' : ''} and send to the {done.k === 'zelle' ? 'address' : 'number'} above.</p>
            </>}
          {(() => {
            const socials = [
              p.ig && { label: 'Instagram', href: `https://instagram.com/${encodeURIComponent(String(p.ig).replace(/^@/, ''))}` },
              p.tt && { label: 'TikTok', href: `https://tiktok.com/@${encodeURIComponent(String(p.tt).replace(/^@/, ''))}` },
              p.fb && { label: 'Facebook', href: String(p.fb).startsWith('http') ? String(p.fb) : `https://facebook.com/${encodeURIComponent(String(p.fb).replace(/^@/, ''))}` },
            ].filter(Boolean);
            return socials.length ? (
              <div className="follow-dj">
                <strong>Enjoying the music?</strong>
                <span>Follow {p.n || 'the DJ'} for upcoming gigs and updates.</span>
                <div className="follow-links">
                  {socials.map((s) => <a key={s.label} className="btn btn-ghost btn-block" href={s.href} target="_blank" rel="noopener noreferrer">Follow on {s.label} ↗</a>)}
                </div>
              </div>
            ) : null;
          })()}
          <button className="btn btn-ghost btn-block" onClick={() => { setDone(null); setG((v) => ({ ...v, song: '', artist: '', note: '' })); window.scrollTo(0, 0); }}>Request another song</button>
        </section>
      </div>
    );
  }

  return (
    <div className={'scope' + (preview ? ' pv' : '')} style={themeStyle(p)}>
      {wall}
      {!preview && <div className="bar"><div className="brand"><i />DJ Request Live</div><span className="eyebrow">Song requests</span></div>}
      <section className="hero">
        {p.logo
          ? <img className="logo" src={p.logo} alt={`${p.n} logo`} style={{ width: `${Math.max(140, Math.min(420, Number(p.ls) || 220))}px`, maxWidth: '80vw' }} />
          : vinylOn && <div className="vinyl spin" aria-hidden="true"><div className="label">{(p.lb || '').trim().slice(0, 3) || initials(p.n)}</div></div>}
        {paused
          ? <span className="eyebrow">Requests are paused</span>
          : <span className="live"><b />{p.live || 'Taking requests now'}</span>}
        {p.showName !== undefined ? p.showName !== false && <h1 className="dj-name">{p.n || 'Your DJ name'}</h1> : !p.logo && <h1 className="dj-name">{p.n || 'Your DJ name'}</h1>}
        {p.t && <p className="tagline">{p.t}</p>}
        {(genres.length > 0 || ig) && (
          <div className="chips">
            {genres.map((x) => <span className="chip" key={x}>{x}</span>)}
            {ig && <a className="chip" href={`https://instagram.com/${encodeURIComponent(ig)}`} target="_blank" rel="noopener noreferrer">@{ig}</a>}
          </div>
        )}
      </section>
      {photos.length > 0 && (
        <div className={'gallery g' + photos.length}>{photos.map((u, i) => <img key={u} src={u} alt={`${p.n} photo ${i + 1}`} loading="lazy" />)}</div>
      )}
      {paused ? (
        <section className="panel center"><h3 style={{ fontSize: 16 }}>The DJ isn’t taking requests right now</h3><p className="hint">Check back soon, or ask the DJ in person.</p></section>
      ) : (
        <>
          <section className="panel">
            <div className="step-h"><span className="n">01</span><h3>What should I play?</h3></div>
            <div className="field"><label htmlFor="g-song">Song</label><input className="input" id="g-song" maxLength={120} placeholder="e.g. Bidi Bidi Bom Bom" value={g.song} onChange={set('song')} autoComplete="off" /></div>
            <div className="row2">
              <div className="field"><label htmlFor="g-artist">Artist</label><input className="input" id="g-artist" maxLength={120} placeholder="e.g. Selena" value={g.artist} onChange={set('artist')} autoComplete="off" /></div>
              <div className="field"><label htmlFor="g-from">Your name</label><input className="input" id="g-from" maxLength={60} placeholder="Optional" value={g.from} onChange={set('from')} /></div>
            </div>
            <div className="field"><label htmlFor="g-note">Shout-out or dedication</label><input className="input" id="g-note" maxLength={200} placeholder="Optional · e.g. Happy birthday Maria!" value={g.note} onChange={set('note')} /></div>
            <div className="hp" aria-hidden="true"><label htmlFor="g-web">Website</label><input id="g-web" tabIndex={-1} autoComplete="off" value={g.web} onChange={set('web')} /></div>
          </section>
          <section className="panel">
            <div className="step-h"><span className="n">02</span><h3>Add a tip</h3></div>
            <div className="amounts" style={{ '--cols': tips.length }}>
              {tips.map((a) => <button key={a} className="amt" aria-pressed={+g.amt === a} onClick={() => setG((x) => ({ ...x, amt: String(a) }))}>${a}</button>)}
            </div>
            <div className="custom"><span>$</span><input inputMode="decimal" placeholder="Custom amount" aria-label="Custom tip amount" value={tips.includes(+g.amt) ? '' : g.amt} onChange={(e) => setG((x) => ({ ...x, amt: e.target.value.replace(/[^\d.]/g, '') }))} /></div>
            {p.m > 0 && <p className={'min' + (belowMin ? ' warn' : '')}>Requests start at {money(p.m)}. Bigger tips get played sooner.</p>}
          </section>
          <section className="panel">
            <div className="step-h"><span className="n">03</span><h3>Send it</h3></div>
            <p className="hint">Pick your app. Your request goes to the DJ, then you finish the tip in that app.</p>
            <div className="paylist">
              {methods.length ? methods.map((x) => (
                <button key={x.k} className="payopt" disabled={busy} onClick={() => pay(x)}>
                  <span className={'pay-ico ' + x.cls}>{x.ab}</span>
                  <span><strong>{x.name}</strong><small>{handleLabel(x.k, p[x.k])}</small></span>
                  <span className="go">NEXT →</span>
                </button>
              )) : <p className="hint">The DJ hasn’t added a payment app yet.</p>}
            </div>
          </section>
        </>
      )}
      <p className="foot">{preview ? 'PREVIEW · GUESTS SEE THIS' : 'POWERED BY DJ REQUEST LIVE'}</p>
    </div>
  );
}
