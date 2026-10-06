import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toProfile, errorText } from '../lib/api.js';
import { themeStyle } from '../lib/theme.js';
import GuestView from '../components/GuestView.jsx';

export default function Guest({ slug }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api.dj(slug).then(
      ({ dj }) => { if (live) { document.title = `${dj.name} · Request a song`; setState({ dj }); } },
      (e) => { if (live) { document.title = 'Page not found · DJ Request Live'; setState({ missing: e.code === 'not_found', error: e }); } },
    );
    return () => { live = false; };
  }, [slug]);

  const { dj } = state;
  const p = dj ? toProfile(dj) : {};
  return (
    <div className="rl" style={dj ? themeStyle(p) : undefined}>
      <div className="wrap">
        {state.loading && <div className="panel center"><p className="hint">Loading…</p></div>}
        {state.error && (
          <section className="panel center">
            <h2 style={{ fontSize: 20 }}>{state.missing ? 'We can’t find that DJ page' : 'Something went wrong'}</h2>
            <p className="hint">{state.missing ? 'Check the spelling, or ask the DJ for their QR code.' : errorText(state.error)}</p>
            <Link className="btn btn-gold" to="/">Go to DJ Request Live</Link>
          </section>
        )}
        {dj && <GuestView p={p} paused={!dj.is_live} onSend={(b) => api.sendRequest(slug, b).catch((e) => { throw new Error(errorText(e)); })} />}
      </div>
    </div>
  );
}
