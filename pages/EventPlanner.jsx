import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, copyText } from '../lib/api.js';
import { songRows } from '../lib/songLibrary.js';
import { toast } from '../lib/toast.js';
import './wedding-planner.css';

const MUSIC_STYLES = ['Country', 'Pop', 'Classic rock', '80s / 90s', 'Hip-hop', 'R&B', 'Disco / funk', 'Latin', 'Tejano', 'Cumbia', 'Bachata', 'Salsa / merengue', 'Reggae', 'Alternative', 'Electronic', 'Jazz', 'Oldies', 'Sing-alongs'];
const MOMENTS = ['Guest arrival / welcome', 'Food service', 'Announcements or speeches', 'Featured activity', 'Open dance begins', 'Final song / wrap-up'];
const clone = value => JSON.parse(JSON.stringify(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const songKey = song => `${String(song?.title || '').trim().toLowerCase()}|${String(song?.artist || '').trim().toLowerCase()}`;

function eventStarters() {
  const candidates = songRows().filter(song => {
    const tags = String(song.tags || '').toLowerCase();
    return song.content !== 'Explicit' && !tags.includes('first-dance') && /party|dance|line-dance|singalong|anthem|group|crossover/.test(tags);
  });
  return candidates.map((song, index) => ({ ...song, _order: index }))
    .sort((a, b) => Number(b.dancefloor || 0) + Number(b.singalong || 0) + Number(b.crossgen || 0) - Number(a.dancefloor || 0) - Number(a.singalong || 0) - Number(a.crossgen || 0) || a._order - b._order)
    .filter((song, index, all) => all.findIndex(other => songKey(other) === songKey(song)) === index)
    .slice(0, 40)
    .map(song => ({ title: song.title, artist: song.artist, genre: song.genre, selected: false, removed: false }));
}

function blankEventPlan() {
  return {
    title: 'New Event', eventType: '', eventDate: '', startTime: '', endTime: '',
    venue: { name: '', address: '' }, organizer: { company: '', name: '', phone: '' },
    guestCount: '', ageRange: '', audienceNotes: '', cleanMusic: '',
    styles: Object.fromEntries(MUSIC_STYLES.map(style => [style, ''])),
    artists: { like: '', dislike: '' }, mustPlay: { songs: [], none: false }, doNotPlay: { songs: [], none: false },
    moments: MOMENTS.map(moment => ({ name: moment, time: '', song: '', notes: '' })),
    spotifyPlaylist: '', openDance: { starters: eventStarters(), custom: [], none: false },
    suggestions: [], collaboratorName: '', notes: '',
  };
}

function eventProgress(plan) {
  const checks = [
    ['Event name and type', nonempty(plan.title) && nonempty(plan.eventType)],
    ['Date and event hours', nonempty(plan.eventDate) && (nonempty(plan.startTime) || nonempty(plan.endTime))],
    ['Venue and address', nonempty(plan.venue?.name) && nonempty(plan.venue?.address)],
    ['Organizer contact', nonempty(plan.organizer?.name) && nonempty(plan.organizer?.phone)],
    ['Guest count or crowd notes', nonempty(plan.guestCount) || nonempty(plan.audienceNotes)],
    ['Music content preference', ['clean', 'any'].includes(plan.cleanMusic)],
    ...MUSIC_STYLES.map(style => [`${style} preference`, ['like', 'dislike', 'no-preference'].includes(plan.styles?.[style])]),
    ['Artist preferences reviewed', nonempty(plan.artists?.like) || nonempty(plan.artists?.dislike) || plan.artists?.reviewed],
    ['Must-play list reviewed', plan.mustPlay?.none || (plan.mustPlay?.songs || []).length > 0],
    ['Do-not-play list reviewed', plan.doNotPlay?.none || (plan.doNotPlay?.songs || []).length > 0],
    ...MOMENTS.map(name => [`${name} plan`, (plan.moments || []).some(item => item.name === name && (nonempty(item.time) || nonempty(item.song) || nonempty(item.notes) || item.skip))]),
    ['Open-dance plan', plan.openDance?.none || (plan.openDance?.starters || []).some(song => song.selected && !song.removed) || (plan.openDance?.custom || []).length > 0],
  ].map(([label, ok]) => ({ label, ok: !!ok }));
  const complete = checks.filter(item => item.ok).length;
  return { checks, complete, total: checks.length, percent: Math.round(complete / checks.length * 100) };
}

function Field({ label, value, onChange, placeholder = '', type = 'text', multiline = false, rows = 3 }) {
  return <label className="wp-field"><span>{label}</span>{multiline
    ? <textarea className="wp-input" value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={rows} />
    : <input className="wp-input" type={type} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} />}</label>;
}

function ActionButton({ children, onClick, disabled = false, ...props }) {
  const compact = String(props.className || '').includes('wp-icon-button');
  const [phase, setPhase] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function run(event) {
    if (disabled || phase === 'working') return;
    setPhase('working');
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const ok = await onClick?.(event);
      setPhase(ok === false ? 'error' : 'done');
      timer.current = setTimeout(() => setPhase('idle'), ok === false ? 2200 : 1250);
    } catch { setPhase('error'); timer.current = setTimeout(() => setPhase('idle'), 2200); }
  }
  return <button {...props} disabled={disabled || phase === 'working'} onClick={run} aria-live="polite" aria-busy={phase === 'working'}>
    {phase === 'idle' ? children : <span className={`wp-action-feedback ${compact ? 'compact' : ''} ${phase}`}>
      {phase === 'working' ? <><i className="wp-spinner" aria-hidden="true" />{!compact && <span>Working…</span>}<span className="wp-sr-only">Working</span></> : phase === 'done'
        ? <><span aria-hidden="true">✓</span>{!compact && <span>Done</span>}<span className="wp-sr-only">Done</span></>
        : <><span aria-hidden="true">!</span>{!compact && <span>Try again</span>}<span className="wp-sr-only">Action failed</span></>}
    </span>}
  </button>;
}

function CheckLine({ checked, onChange, children }) {
  return <label className="wp-check"><input type="checkbox" checked={!!checked} onChange={event => onChange(event.target.checked)} /><span>{children}</span></label>;
}

export default function EventPlanner({ shared = false }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(blankEventPlan);
  const [planId, setPlanId] = useState(null);
  const [shareToken, setShareToken] = useState(token);
  const [plans, setPlans] = useState([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('Loading event plan…');
  const [notice, setNotice] = useState('');
  const [printMode, setPrintMode] = useState('');
  const [query, setQuery] = useState('');
  const [newSong, setNewSong] = useState({ title: '', artist: '' });
  const [newListSong, setNewListSong] = useState({ mustPlay: { title: '', artist: '' }, doNotPlay: { title: '', artist: '' } });
  const [suggestion, setSuggestion] = useState({ section: 'Open dance', text: '' });
  const revision = useRef(0);

  const loadOwner = useCallback(async () => {
    setReady(false); setStatus('Loading saved events…');
    try {
      const result = await api.eventPlans();
      setPlans(result.plans || []);
      if (result.plans?.length) {
        const requestedId = new URLSearchParams(window.location.search).get('id');
        const saved = result.plans.find(item => String(item.id) === String(requestedId)) || result.plans[0]; setPlanId(saved.id); setShareToken(saved.share_token); setPlan({ ...blankEventPlan(), ...(saved.plan || {}) });
      } else {
        const created = await api.createEventPlan(blankEventPlan());
        setPlanId(created.id); setShareToken(created.share_token); setPlan({ ...blankEventPlan(), ...(created.plan || {}) });
        setPlans([{ id: created.id, share_token: created.share_token, plan: created.plan, updated_at: created.updated_at }]);
      }
      setStatus('Saved');
    } catch (error) {
      if (error.status === 401) navigate('/login', { replace: true });
      else setStatus('Could not load events. Refresh to try again.');
    } finally { setReady(true); setDirty(false); }
  }, [navigate]);

  useEffect(() => {
    document.title = shared ? 'Shared Event Plan · DJ Request Live' : 'Event Planner · DJ Request Live';
    if (!shared) { loadOwner(); return; }
    setReady(false);
    api.eventShare(token).then(result => { setPlan({ ...blankEventPlan(), ...(result.plan || {}) }); setShareToken(token); setStatus('Shared event'); setReady(true); })
      .catch(() => { setStatus('This event link is unavailable. Ask the organizer for a new link.'); setReady(true); });
  }, [shared, token, loadOwner]);

  useEffect(() => {
    if (!ready || !dirty || (!shared && !planId)) return undefined;
    const currentRevision = revision.current;
    const timer = setTimeout(async () => {
      setStatus('Saving…');
      try {
        if (shared) await api.saveEventShare(token, plan); else await api.saveEventPlan(planId, plan);
        if (revision.current === currentRevision) { setDirty(false); setStatus('All changes saved'); }
      } catch (error) { setStatus(error.code === 'event_plan_not_found' ? 'This share link is unavailable.' : 'Could not save. Check your connection and try again.'); }
    }, 850);
    return () => clearTimeout(timer);
  }, [plan, planId, shared, token, dirty, ready]);

  useEffect(() => {
    if (!printMode) return undefined;
    const after = () => setPrintMode(''); window.addEventListener('afterprint', after);
    const timer = setTimeout(() => window.print(), 100);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, [printMode]);

  const progress = useMemo(() => eventProgress(plan), [plan]);
  const excluded = useMemo(() => new Set((plan.doNotPlay?.songs || []).map(songKey)), [plan.doNotPlay?.songs]);
  const shareUrl = shareToken ? `${window.location.origin}/event-plan/${shareToken}` : '';
  const matchingSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? songRows().filter(song => `${song.title} ${song.artist} ${song.genre}`.toLowerCase().includes(needle)).slice(0, 10) : [];
  }, [query]);
  const playlistRows = [
    ...(plan.mustPlay?.songs || []), ...(plan.openDance?.starters || []).filter(song => song.selected && !song.removed), ...(plan.openDance?.custom || []),
  ].filter(song => !excluded.has(songKey(song))).filter((song, index, all) => all.findIndex(other => songKey(other) === songKey(song)) === index);

  function edit(updater) { revision.current += 1; setPlan(previous => typeof updater === 'function' ? updater(previous) : updater); setDirty(true); setStatus('Changes not saved'); }
  function setField(section, key, value) { edit(previous => key ? ({ ...previous, [section]: { ...(previous[section] || {}), [key]: value } }) : ({ ...previous, [section]: value })); }
  function addListSong(section) {
    const song = newListSong[section]; if (!nonempty(song.title) || !nonempty(song.artist)) return;
    if (section === 'mustPlay' && excluded.has(songKey(song))) { toast('Remove this song from do-not-play before adding it as a must-play.'); return; }
    edit(previous => ({ ...previous, [section]: { ...previous[section], none: false, songs: [...(previous[section]?.songs || []), { title: song.title.trim(), artist: song.artist.trim() }] } }));
    setNewListSong(previous => ({ ...previous, [section]: { title: '', artist: '' } }));
  }
  function addDanceSong(song) {
    const clean = { title: String(song.title || '').trim(), artist: String(song.artist || '').trim() }; if (!clean.title || !clean.artist) return;
    if (excluded.has(songKey(clean))) { toast('This song is on the do-not-play list.'); return; }
    edit(previous => ({ ...previous, openDance: { ...previous.openDance, none: false, custom: [...(previous.openDance?.custom || []).filter(other => songKey(other) !== songKey(clean)), clean] } }));
  }
  function suggestEventMix() {
    const styles = plan.styles || {};
    const likedStyles = Object.entries(styles).filter(([, value]) => value === 'like').map(([name]) => name.toLowerCase());
    const dislikedStyles = Object.entries(styles).filter(([, value]) => value === 'dislike').map(([name]) => name.toLowerCase());
    const artistLikes = String(plan.artists?.like || '').toLowerCase();
    const artistDislikes = String(plan.artists?.dislike || '').toLowerCase();
    const candidates = (plan.openDance?.starters || []).filter(song => !song.removed && !excluded.has(songKey(song)) &&
      !artistDislikes.split(/[\n,;]/).some(name => name.trim() && String(song.artist).toLowerCase().includes(name.trim())));
    const score = song => {
      const genre = String(song.genre || '').toLowerCase();
      const artist = String(song.artist || '').toLowerCase();
      const disliked = dislikedStyles.some(style => genre.includes(style) || style.includes(genre));
      const liked = likedStyles.some(style => genre.includes(style) || style.includes(genre));
      const favoriteArtist = artistLikes.split(/[\n,;]/).some(name => name.trim() && artist.includes(name.trim()));
      return Number(song.dancefloor || 0) + Number(song.singalong || 0) + Number(song.crossgen || 0) + (liked ? 18 : 0) - (disliked ? 45 : 0) + (favoriteArtist ? 12 : 0);
    };
    const chosen = [...candidates].sort((a, b) => score(b) - score(a)).slice(0, 12);
    const keys = new Set(chosen.map(songKey));
    edit(previous => ({ ...previous, openDance: { ...previous.openDance, none: false, starters: previous.openDance.starters.map(song => ({ ...song, selected: keys.has(songKey(song)) && !song.removed })) } }));
    setNotice(`SI DJ suggested ${chosen.length} starters using the event’s music styles and artist preferences. Do-not-play songs are excluded.`);
  }
  async function createAnother() {
    try {
      setStatus('Creating an event plan…');
      const created = await api.createEventPlan(blankEventPlan());
      setPlanId(created.id); setShareToken(created.share_token); setPlan(created.plan); setPlans(previous => [{ ...created }, ...previous]); setDirty(false); setStatus('Saved'); return true;
    } catch { toast('Could not create an event plan.'); return false; }
  }
  async function choosePlan(id) {
    if (String(id) === String(planId)) return;
    setReady(false);
    try { const saved = await api.eventPlan(id); setPlanId(saved.id); setShareToken(saved.share_token); setPlan({ ...blankEventPlan(), ...(saved.plan || {}) }); setDirty(false); setStatus('Saved'); }
    catch { setStatus('Could not open that event plan.'); }
    finally { setReady(true); }
  }
  async function copyShareLink() {
    const copied = await copyText(shareUrl);
    if (copied) toast('Event link copied.'); else toast('Could not copy the link. Select and copy it below.');
    return copied;
  }
  function addSuggestion() {
    if (!nonempty(suggestion.text)) return;
    edit(previous => ({ ...previous, suggestions: [...(previous.suggestions || []), { ...suggestion, text: suggestion.text.trim(), from: plan.collaboratorName.trim() || 'Event guest', createdAt: Date.now() }] }));
    setSuggestion(previous => ({ ...previous, text: '' }));
  }
  function addCustomSong() {
    if (!nonempty(newSong.title) || !nonempty(newSong.artist)) return;
    addDanceSong(newSong); setNewSong({ title: '', artist: '' });
  }
  function exportPlaylist() {
    if (!playlistRows.length) return false;
    const lines = [`${plan.title || 'Event'} - Open Dance Playlist`, `Event date: ${plan.eventDate || 'Not set'}`, plan.venue?.name ? `Venue: ${plan.venue.name}` : '', '', 'SONG - ARTIST', ...playlistRows.map((song, index) => `${String(index + 1).padStart(2, '0')}. ${song.title} - ${song.artist}`)].filter(Boolean);
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'event-open-dance-playlist.txt'; anchor.click(); URL.revokeObjectURL(url); return true;
  }
  function removeListSong(section, index) { edit(previous => ({ ...previous, [section]: { ...previous[section], songs: previous[section].songs.filter((_, i) => i !== index) } })); }
  function print(mode) { setPrintMode(mode); return true; }

  if (!ready) return <main className="wedding-app"><div className="wp-loading">{status}</div></main>;
  const spotifyHref = /^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+(?:\?.*)?$/i.test(plan.spotifyPlaylist || '') ? plan.spotifyPlaylist : '';
  return <main className={`wedding-app ${printMode === 'playlist' ? 'print-playlist' : ''}`}>
    <div className="wp-shell" id="event-print-area">
      <header className="wp-topbar wedding-no-print">
        <Link to={shared ? '/' : '/studio?tab=queue'} className="wp-wordmark">DJ Request Live <span>Events</span></Link>
        <span className="wp-save-status" role="status">{status}</span>
        {!shared && <Link className="wp-small-link" to="/plans">All plans</Link>}
      </header>
      <section className="wp-hero"><div><p className="wp-kicker">Music for every kind of gathering</p><h1>{shared ? 'Shape the event together.' : 'Plan the music, keep everyone in the loop.'}</h1><p className="wp-lede">One shared plan for the venue, the crowd, favorite songs, and the moments that matter. Invite your team, host, or guests to contribute.</p></div><div className="wp-progressbox"><div className="wp-progress-top"><span>Planning progress</span><strong>{progress.percent}%</strong></div><div className="wp-progress"><span style={{ width: `${progress.percent}%` }} /></div><small>{progress.complete} of {progress.total} planning items answered</small></div></section>

      {!shared && <section className="wp-sharebar wedding-no-print"><div className="wp-plan-select"><label htmlFor="event-plan-select">Your events</label><select id="event-plan-select" value={planId || ''} onChange={event => choosePlan(event.target.value)}>{plans.map(item => <option key={item.id} value={item.id}>{item.plan?.title || `Event ${item.id}`}</option>)}</select><ActionButton type="button" className="wp-button wp-button-light" onClick={createAnother}>New event</ActionButton></div><div className="wp-share-action"><div><b>Invite your team or guests</b><small>Anyone with the private link can add details and song ideas.</small></div><ActionButton type="button" className="wp-button wp-button-dark" onClick={copyShareLink}>Copy event link</ActionButton></div><label className="wp-link-copy" htmlFor="event-share-link">Private planning link<input id="event-share-link" readOnly value={shareUrl} onFocus={event => event.target.select()} /></label></section>}
      {shared && <section className="wp-collab-banner"><b>Shared event workspace</b><span>Your changes are shared with the organizer and everyone using this private link.</span><Field label="Your name" value={plan.collaboratorName} onChange={value => setField('collaboratorName', '', value)} /></section>}

      <div className="wp-layout">
        <div className="wp-form-column">
          <div className="wp-print-title"><p>DJ Request Live · Event plan</p><h1>{plan.title || 'Event music plan'}</h1><small>{plan.eventDate || ''} {plan.venue?.name ? `· ${plan.venue.name}` : ''}</small></div>
          <section className="wp-card"><div className="wp-section-head"><span className="wp-section-index">1</span><div><h2>Event and venue</h2><p>Tell your DJ what the gathering is, where it will happen, and who to contact.</p></div></div>
            <div className="wp-grid wp-grid-2"><Field label="Event name" value={plan.title} onChange={value => edit(previous => ({ ...previous, title: value }))} placeholder="Company summer party" /><label className="wp-field"><span>Event type</span><select className="wp-input" value={plan.eventType} onChange={event => setField('eventType', '', event.target.value)}><option value="">Choose a type</option>{['Birthday or anniversary', 'Company event', 'School or community event', 'Holiday party', 'Fundraiser', 'Family reunion', 'Private party', 'Other'].map(type => <option key={type}>{type}</option>)}</select></label><Field label="Event date" type="date" value={plan.eventDate} onChange={value => setField('eventDate', '', value)} /><Field label="Start time" type="time" value={plan.startTime} onChange={value => setField('startTime', '', value)} /><Field label="End time" type="time" value={plan.endTime} onChange={value => setField('endTime', '', value)} /><Field label="Venue name" value={plan.venue?.name} onChange={value => setField('venue', 'name', value)} placeholder="Venue or location" /><Field label="Venue address and directions" value={plan.venue?.address} onChange={value => setField('venue', 'address', value)} placeholder="Street, city, access notes" /><Field label="Organizer or host" value={plan.organizer?.name} onChange={value => setField('organizer', 'name', value)} placeholder="Name" /><Field label="Company or group" value={plan.organizer?.company} onChange={value => setField('organizer', 'company', value)} placeholder="Optional" /><Field label="Best contact phone" value={plan.organizer?.phone} onChange={value => setField('organizer', 'phone', value)} placeholder="Phone number" /><Field label="Expected guest count" type="number" value={plan.guestCount} onChange={value => setField('guestCount', '', value)} placeholder="Approximate number" /><Field label="Guest age range" value={plan.ageRange} onChange={value => setField('ageRange', '', value)} placeholder="For example, all ages or 25–50" /></div>
            <Field label="Who is coming and what should the DJ know about the crowd?" value={plan.audienceNotes} onChange={value => setField('audienceNotes', '', value)} multiline placeholder="Languages, cultures, energy, accessibility, or anything that helps set the tone." />
          </section>

          <section className="wp-card"><div className="wp-section-head"><span className="wp-section-index">2</span><div><h2>Music taste</h2><p>Choose a direction for the room, then name any artists or content preferences.</p></div></div>
            <div className="wp-grid wp-grid-2"><label className="wp-field"><span>Lyrics</span><select className="wp-input" value={plan.cleanMusic} onChange={event => setField('cleanMusic', '', event.target.value)}><option value="">Choose a preference</option><option value="clean">Clean / family-friendly only</option><option value="any">Explicit songs are okay</option></select></label><Field label="Artists or songs you want to hear" value={plan.artists?.like} onChange={value => setField('artists', 'like', value)} multiline placeholder="Separate artists or songs with commas" /><Field label="Artists or songs to avoid" value={plan.artists?.dislike} onChange={value => setField('artists', 'dislike', value)} multiline placeholder="Separate artists or songs with commas" /></div>
            <CheckLine checked={plan.artists?.reviewed} onChange={value => setField('artists', 'reviewed', value)}>No specific artist preferences</CheckLine>
            <h3 className="wp-subhead">Music styles</h3><div className="wp-style-list">{MUSIC_STYLES.map(style => <div className="wp-style-row" key={style}><b>{style}</b><div className="wp-choice-group">{[['like', 'Like'], ['dislike', 'Skip'], ['no-preference', 'Any']].map(([key, label]) => <button type="button" className={plan.styles?.[style] === key ? 'selected' : ''} key={key} aria-pressed={plan.styles?.[style] === key} onClick={() => setField('styles', style, key)}>{label}</button>)}</div></div>)}</div>
          </section>

          <section className="wp-card"><div className="wp-section-head"><span className="wp-section-index">3</span><div><h2>Key moments</h2><p>Add timing, a song, or a note for the main parts of the event. Skip anything that does not apply.</p></div></div>
            <div className="wp-time-list">{(plan.moments || []).map((moment, index) => <div className="wp-time-row event-moment-row" key={moment.name}><div><b>{moment.name}</b></div><input className="wp-input" aria-label={`${moment.name} time`} type="time" value={moment.time || ''} onChange={event => edit(previous => ({ ...previous, moments: previous.moments.map((item, i) => i === index ? { ...item, time: event.target.value } : item) }))} /><input className="wp-input" aria-label={`${moment.name} song or note`} placeholder="Song / note" value={moment.song || ''} onChange={event => edit(previous => ({ ...previous, moments: previous.moments.map((item, i) => i === index ? { ...item, song: event.target.value } : item) }))} /><CheckLine checked={moment.skip} onChange={skip => edit(previous => ({ ...previous, moments: previous.moments.map((item, i) => i === index ? { ...item, skip } : item) }))}>Skip</CheckLine></div>)}</div>
          </section>

          {['mustPlay', 'doNotPlay'].map((section, idx) => { const isMust = section === 'mustPlay'; const list = plan[section] || { songs: [], none: false }; return <section className="wp-card" key={section}><div className="wp-section-head"><span className="wp-section-index">{idx + 4}</span><div><h2>{isMust ? 'Must-play songs' : 'Do-not-play songs'}</h2><p>{isMust ? 'Songs that will make this event feel personal.' : 'Songs you do not want played, including guest requests.'}</p></div></div>
            {(list.songs || []).map((song, index) => <div className="wp-list-song" key={`${songKey(song)}-${index}`}><span>{song.title}</span><span>{song.artist}</span><ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Remove ${song.title}`} onClick={() => removeListSong(section, index)}>×</ActionButton></div>)}
            <div className="wp-add-song wedding-no-print"><input className="wp-input" aria-label="Song title" placeholder="Song title" value={newListSong[section].title} onChange={event => setNewListSong(previous => ({ ...previous, [section]: { ...previous[section], title: event.target.value } }))} /><input className="wp-input" aria-label="Artist" placeholder="Artist" value={newListSong[section].artist} onChange={event => setNewListSong(previous => ({ ...previous, [section]: { ...previous[section], artist: event.target.value } }))} /><ActionButton type="button" className="wp-button wp-button-light" onClick={() => addListSong(section)}>Add song</ActionButton></div>
            <CheckLine checked={list.none} onChange={value => setField(section, 'none', value)}>{isMust ? 'No must-play songs' : 'No restricted songs'}</CheckLine>
          </section>; })}

          <section className="wp-card"><div className="wp-section-head"><span className="wp-section-index">6</span><div><h2>Open dance playlist</h2><p>Keep the SI DJ starters that suit the crowd, add personal picks, and connect a Spotify playlist.</p></div></div>
            <Field label="Spotify playlist link" value={plan.spotifyPlaylist} onChange={value => setField('spotifyPlaylist', '', value)} placeholder="Paste a Spotify playlist URL" />{plan.spotifyPlaylist && (spotifyHref ? <a className="wp-external-link wedding-no-print" href={spotifyHref} target="_blank" rel="noreferrer">Open this playlist in Spotify</a> : <p className="wp-inline-error">Paste a Spotify playlist URL.</p>)}
            <div className="wp-starter-tools wedding-no-print"><span><b>{(plan.openDance?.starters || []).filter(song => song.selected && !song.removed && !excluded.has(songKey(song))).length}</b> of 40 starters kept</span><div><ActionButton type="button" className="wp-button wp-button-light" onClick={suggestEventMix}>Suggest 12 for this event</ActionButton><ActionButton type="button" className="wp-button wp-button-light" onClick={() => setField('openDance', 'starters', (plan.openDance?.starters || []).map(song => ({ ...song, selected: !song.removed && !excluded.has(songKey(song)) })))}>Keep all 40</ActionButton></div></div>
            {notice && <p className="wp-help wedding-no-print" role="status">{notice}</p>}
            {(plan.openDance?.starters || []).map((song, index) => <div className="wp-starter-row" key={`${songKey(song)}-${index}`}><label className="wp-keep"><input type="checkbox" checked={!!song.selected && !song.removed} onChange={event => edit(previous => ({ ...previous, openDance: { ...previous.openDance, starters: previous.openDance.starters.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item) } }))} />Keep</label><div><b>{song.title}</b><span>{song.artist} · {song.genre}</span></div><small>{song.removed ? 'Crossed off' : ''}</small><ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Cross off ${song.title}`} onClick={() => edit(previous => ({ ...previous, openDance: { ...previous.openDance, starters: previous.openDance.starters.map((item, i) => i === index ? { ...item, selected: false, removed: true } : item) } }))}>×</ActionButton></div>)}
            <div className="wp-add-custom wedding-no-print"><div className="wp-grid wp-grid-2"><Field label="Add another song" value={newSong.title} onChange={value => setNewSong(previous => ({ ...previous, title: value }))} placeholder="Song title" /><Field label="Artist" value={newSong.artist} onChange={value => setNewSong(previous => ({ ...previous, artist: value }))} placeholder="Artist name" /></div><ActionButton type="button" className="wp-button wp-button-dark" onClick={addCustomSong}>Add to playlist</ActionButton></div>
            <div className="wp-library-search wedding-no-print"><Field label="Find a song in the DJ Request Live song guide" value={query} onChange={setQuery} placeholder="Search title, artist, or style" />{matchingSongs.length > 0 && <div className="wp-search-results">{matchingSongs.map(song => <ActionButton type="button" key={songKey(song)} onClick={() => addDanceSong(song)}><span><b>{song.title}</b><small>{song.artist} · {song.genre}</small></span><strong>Add</strong></ActionButton>)}</div>}</div>
            {(plan.openDance?.custom || []).map((song, index) => <div className="wp-list-song" key={`${songKey(song)}-${index}`}><span>{song.title}</span><span>{song.artist}</span><ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Remove ${song.title}`} onClick={() => edit(previous => ({ ...previous, openDance: { ...previous.openDance, custom: previous.openDance.custom.filter((_, i) => i !== index) } }))}>×</ActionButton></div>)}
            <CheckLine checked={plan.openDance?.none} onChange={value => setField('openDance', 'none', value)}>No preset open-dance songs; let the DJ read the room</CheckLine>
          </section>

          <section className="wp-card"><div className="wp-section-head"><span className="wp-section-index">7</span><div><h2>Notes and contributions</h2><p>Invite staff, family, or guests to leave useful details and music ideas.</p></div></div>
            <div className="wp-add-suggestion wedding-no-print"><select className="wp-input" aria-label="Contribution section" value={suggestion.section} onChange={event => setSuggestion(previous => ({ ...previous, section: event.target.value }))}><option>Open dance</option><option>Music preference</option><option>Key moment</option><option>Venue</option><option>Other note</option></select><input className="wp-input" aria-label="Event contribution" value={suggestion.text} onChange={event => setSuggestion(previous => ({ ...previous, text: event.target.value }))} placeholder="Add a song, detail, or suggestion" /><ActionButton type="button" className="wp-button wp-button-dark" onClick={addSuggestion}>Add note</ActionButton></div>
            {(plan.suggestions || []).map((item, index) => <div className="wp-table-row" key={`${item.createdAt}-${index}`}><b>{item.section}</b><span>{item.text}</span><small>{item.from}</small></div>)}
            <Field label="Anything else the DJ or event team should know?" value={plan.notes} onChange={value => setField('notes', '', value)} multiline placeholder="Setup needs, access details, announcements, or other notes" />
          </section>
        </div>
        <aside className="wp-sidebar wedding-no-print"><section className="wp-side-card"><p className="wp-side-kicker">Before you export</p><h2>{progress.percent === 100 ? 'Ready to take with you.' : 'A few details still need a reply.'}</h2><p className="wp-side-note">Completed items have an answer, a clear skip, or a song choice.</p><ul className="wp-missing">{progress.checks.filter(item => !item.ok).slice(0, 10).map(item => <li key={item.label}>{item.label}</li>)}</ul><ActionButton type="button" className="wp-button wp-button-dark wp-wide" onClick={() => print('sheet')}>Save event sheet as PDF</ActionButton><ActionButton type="button" className="wp-button wp-button-light wp-wide" disabled={!playlistRows.length} onClick={exportPlaylist}>Download playlist (.txt)</ActionButton><ActionButton type="button" className="wp-button wp-button-light wp-wide" disabled={!playlistRows.length} onClick={() => print('playlist')}>Save playlist as PDF</ActionButton><small>Choose “Save as PDF” in the print window.</small></section>
          <section className="wp-side-card wp-playlist-preview wedding-print-playlist"><p className="wp-side-kicker">Open dance playlist</p><h2>{plan.title || 'Event playlist'}</h2>{playlistRows.length ? <ol>{playlistRows.map((song, index) => <li key={`${songKey(song)}-${index}`}>{song.title}<span>{song.artist}</span></li>)}</ol> : <p className="wp-side-note">Keep songs in the open-dance section to build this playlist.</p>}</section></aside>
      </div>
      <footer className="wp-footer wedding-no-print">DJ Request Live · Event music planning</footer>
    </div>
  </main>;
}
