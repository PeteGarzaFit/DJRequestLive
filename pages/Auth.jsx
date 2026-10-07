import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../lib/api.js';
import { Mark } from '../components/Logo.jsx';

const slugify = (s) => s.toLowerCase().replace(/^dj\s*/, 'dj').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', slug: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [free, setFree] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = (signup ? 'Create your page' : 'Log in') + ' · DJ Request Live'; }, [signup]);
  useEffect(() => { api.me().then(() => nav('/studio', { replace: true }), () => {}); }, [nav]);
  useEffect(() => {
    if (!signup || f.slug.length < 3) { setFree(null); return undefined; }
    const t = setTimeout(() => api.slugFree(f.slug).then((r) => setFree(r.available), () => setFree(null)), 350);
    return () => clearTimeout(t);
  }, [f.slug, signup]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(v) } : {}) }));
  };

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (signup) await api.signup({ name: f.name, email: f.email, password: f.password, slug: f.slug });
      else await api.login({ email: f.email, password: f.password });
      nav('/studio', { replace: true });
    } catch (x) { setErr(errorText(x)); } finally { setBusy(false); }
  }

  return (
    <div className="rl rl-app">
      <div className="wrap">
        <div className="bar"><Link to="/" className="back">← Home</Link><div className="brand"><Mark size={26} badge />DJ Request Live</div></div>
        <form className="panel authcard" onSubmit={submit}>
          <h1 style={{ fontSize: 24 }}>{signup ? 'Create your DJ page' : 'Welcome back'}</h1>
          <p className="hint" style={{ marginTop: -6 }}>{signup ? 'Takes about two minutes. Free to start.' : 'Log in to your studio.'}</p>
          {signup && <div className="field"><label htmlFor="a-name">DJ name</label><input className="input" id="a-name" required maxLength={60} value={f.name} onChange={set('name')} autoComplete="nickname" /></div>}
          <div className="field"><label htmlFor="a-email">Email</label><input className="input" id="a-email" type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></div>
          <div className="field"><label htmlFor="a-pw">Password</label><input className="input" id="a-pw" type="password" required minLength={signup ? 8 : 1} value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} />{signup && <span className="hint">At least 8 characters.</span>}</div>
          {signup && (
            <div className="field"><label htmlFor="a-slug">Your page link</label>
              <div className="slugrow"><span>djrequestlive.com/</span><input id="a-slug" required value={f.slug} maxLength={30} onChange={(e) => { setSlugTouched(true); setF((x) => ({ ...x, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })); }} autoCapitalize="off" /></div>
              <span className={'fine ' + (free === true ? 'okmsg' : free === false ? 'badmsg' : '')}>{free === true ? 'That link is available.' : free === false ? 'That link isn’t available.' : '3–30 letters, numbers or dashes.'}</span>
            </div>
          )}
          {err && <div className="msg err" role="alert">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy || (signup && free === false)}>{busy ? 'One moment…' : signup ? 'Create my page' : 'Log in'}</button>
          <p className="hint center">{signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/signup">Create your page</Link></>}</p>
        </form>
      </div>
    </div>
  );
}
