import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, copyText } from '../lib/api.js';
import { songRows } from '../lib/songLibrary.js';
import { toast } from '../lib/toast.js';
import './wedding-planner.css';

const FAMILY_ROLES = ['Bride', 'Groom', "Bride's mother", "Bride's father", "Groom's mother", "Groom's father"];
const DAY_SCHEDULE = [
  ['ceremonyEnds', 'Wedding ceremony ends'],
  ['guestsArrive', 'Guests begin arriving at reception'],
  ['partyArrives', 'Bridal party arrives at reception'],
  ['receptionStarts', 'Reception events begin'],
  ['receptionEnds', 'Reception ends'],
];
const RECEPTION_EVENTS = [
  'Guests eat', 'Bride and Groom first dance', 'Bride dances with her father',
  'Groom dances with his mother', 'Dance floor opens to all', 'Cutting of the cake',
  "Best man's toast", 'Cake is served', 'Bouquet and garter toss',
];
const BRIDAL_ENTRIES = [
  ['Bride and Groom', 'Bride and Groom'],
  ['Best Man and Maid of Honor', 'Best Man and Maid of Honor'],
  ['Attendants', 'Attendants 1'], ['Attendants', 'Attendants 2'],
  ['Ring Bearer and Flower Girl', 'Ring Bearer and Flower Girl'],
];
const SPECIAL_EVENTS = [
  'Bride and Groom grand entrance', 'Bridal party announcements', 'Bride and Groom first dance',
  'Bride dances with her father', 'Groom dances with his mother',
];
const MUSIC_STYLES = [
  'Country', 'Pop', 'Oldies (50s and 60s)', 'Classic Rock (60s and 70s)', '80s Rock / Pop', 'Rap', 'R&B',
  'Heavy Metal', 'Classical', 'Latin Pop', 'Bachata', 'Tejano', 'Cumbia', 'Zapateado', 'Norteño', 'Conjunto',
  'Huapango', 'Salsa / Merengue', 'Reggaeton', 'Folk', 'Jazz', 'Alternative Rock', 'Big Band', 'Christian',
  'Disco / Funk', 'Hip Hop', 'Reggae', 'Punk', 'Techno',
];
const DJ_BEHAVIORS = [
  'Encourage guests to participate', 'Single out guests who are not dancing',
  'Joke / laugh / talk during open dance', 'Be humorous when announcing events',
  'Be serious / professional when announcing events', 'Take requests from guests',
  'Take requests from the bridal party',
];

function weddingStarters() {
  const candidates = songRows().filter(s => {
    const tags = String(s.tags || '').toLowerCase();
    return s.content !== 'Explicit' && !tags.includes('first-dance') && /party|dance|line-dance|singalong|anthem|group|crossover/.test(tags);
  });
  return candidates.map((s, i) => ({ ...s, _order: i }))
    .sort((a, b) => (Number(b.dancefloor || 0) + Number(b.singalong || 0) + Number(b.crossgen || 0)) -
      (Number(a.dancefloor || 0) + Number(a.singalong || 0) + Number(a.crossgen || 0)) || a._order - b._order)
    .filter((s, i, all) => all.findIndex(x => songKey(x) === songKey(s)) === i)
    .slice(0, 40)
    .map(s => ({ title: s.title, artist: s.artist, genre: s.genre, selected: false, removed: false, source: 'SI DJ starter 40' }));
}

function blankPlan() {
  return {
    title: 'Wedding Music Plan',
    couple: { bride: '', groom: '' },
    coordinator: { name: '', phone: '' },
    contacts: FAMILY_ROLES.map(role => ({ role, phone: '', notShared: false })),
    venue: { name: '', directions: '' },
    daySchedule: Object.fromEntries(DAY_SCHEDULE.map(([key]) => [key, { time: '', tbd: false }])),
    receptionSchedule: RECEPTION_EVENTS.map(event => ({ event, time: '', tbd: false })),
    bridalEntries: BRIDAL_ENTRIES.map(([group, role]) => ({ group, role, names: '', notApplicable: false })),
    specialSongs: SPECIAL_EVENTS.map(event => ({ event, title: '', artist: '', notApplicable: false })),
    mustPlay: { songs: [], none: false },
    doNotPlay: { songs: [], none: false },
    styles: Object.fromEntries(MUSIC_STYLES.map(style => [style, ''])),
    artists: { like: '', dislike: '', reviewed: false },
    behaviors: Object.fromEntries(DJ_BEHAVIORS.map(behavior => [behavior, ''])),
    spotifyPlaylist: '',
    openDance: { starters: weddingStarters(), custom: [], none: false },
    suggestions: [],
    collaboratorName: '',
    notes: '',
  };
}

const clone = x => JSON.parse(JSON.stringify(x));
const nonempty = x => typeof x === 'string' && x.trim().length > 0;

function weddingProgress(p) {
  const checks = [];
  const add = (label, ok) => checks.push({ label, ok: !!ok });
  const c = p?.couple || {};
  add('Bride’s name', nonempty(c.bride));
  add('Groom’s name', nonempty(c.groom));
  add('Primary contact name and phone', nonempty(p?.coordinator?.name) && nonempty(p?.coordinator?.phone));
  (p?.contacts || []).forEach(x => add(`${x.role} contact number`, x.notShared || nonempty(x.phone)));
  add('Venue and location directions', nonempty(p?.venue?.name) && nonempty(p?.venue?.directions));
  DAY_SCHEDULE.forEach(([key, label]) => {
    const x = p?.daySchedule?.[key] || {};
    add(label, nonempty(x.time) || x.tbd);
  });
  (p?.receptionSchedule || []).forEach(x => add(`${x.event} timing`, nonempty(x.time) || x.tbd));
  (p?.bridalEntries || []).forEach(x => add(`${x.role} announcement`, x.notApplicable || nonempty(x.names)));
  (p?.specialSongs || []).forEach(x => add(`${x.event} song`, x.notApplicable || (nonempty(x.title) && nonempty(x.artist))));
  add('Must-play list or no requests', p?.mustPlay?.none || (p?.mustPlay?.songs || []).length > 0);
  add('Do-not-play list or no restrictions', p?.doNotPlay?.none || (p?.doNotPlay?.songs || []).length > 0);
  MUSIC_STYLES.forEach(style => add(`${style} preference`, ['like', 'dislike', 'no-preference'].includes(p?.styles?.[style])));
  add('Artist preferences reviewed', p?.artists?.reviewed || nonempty(p?.artists?.like) || nonempty(p?.artists?.dislike));
  DJ_BEHAVIORS.forEach(behavior => add(`${behavior} preference`, ['do', 'dont', 'no-preference'].includes(p?.behaviors?.[behavior])));
  const restricted = new Set((p?.doNotPlay?.songs || []).map(songKey));
  const kept = (p?.openDance?.starters || []).filter(x => x.selected && !x.removed && !restricted.has(songKey(x))).length +
    (p?.openDance?.custom || []).filter(x => !restricted.has(songKey(x))).length;
  add('Open-dance choices or DJ to build live', p?.openDance?.none || kept > 0);
  const complete = checks.filter(x => x.ok).length;
  return { checks, complete, total: checks.length, percent: checks.length ? Math.round(complete / checks.length * 100) : 0 };
}

function rowSong(song = {}) { return { title: song.title || '', artist: song.artist || '' }; }
function spotifyPlaylistHref(value) {
  const s = String(value || '').trim();
  if (/^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+(?:\?.*)?$/i.test(s)) return s;
  const uri = s.match(/^spotify:playlist:([A-Za-z0-9]+)$/i);
  return uri ? `https://open.spotify.com/playlist/${uri[1]}` : '';
}
function songKey(s) { return `${String(s?.title || '').trim().toLowerCase()}|${String(s?.artist || '').trim().toLowerCase()}`; }

function Field({ label, value, onChange, placeholder = '', multiline = false, rows = 3, type = 'text', required = false }) {
  const common = { className: 'wp-input', value: value ?? '', onChange: e => onChange(e.target.value), placeholder, required };
  return <label className="wp-field"><span>{label}{required && <i>Required</i>}</span>{multiline ? <textarea {...common} rows={rows} /> : <input {...common} type={type} />}</label>;
}

function CheckLine({ checked, onChange, children }) {
  return <label className="wp-check"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /><span>{children}</span></label>;
}

function ActionButton({ children, onClick, disabled = false, ...props }) {
  const compact = String(props.className || '').includes('wp-icon-button');
  const [phase, setPhase] = useState('idle');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function run(event) {
    if (disabled || phase === 'working') return;
    clearTimeout(timer.current);
    setPhase('working');
    try {
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const succeeded = await onClick?.(event);
      setPhase(succeeded === false ? 'error' : 'done');
      timer.current = setTimeout(() => setPhase('idle'), succeeded === false ? 2200 : 1250);
    } catch (error) {
      setPhase('error');
      timer.current = setTimeout(() => setPhase('idle'), 2200);
    }
  }
  return <button {...props} disabled={disabled || phase === 'working'} onClick={run} aria-live="polite" aria-busy={phase === 'working'}>
    {phase === 'idle' ? children : <span className={`wp-action-feedback ${compact ? 'compact' : ''} ${phase}`}>
      {phase === 'working' ? <><i className="wp-spinner" aria-hidden="true" />{!compact && <span>Working…</span>}<span className="wp-sr-only">Working</span></> :
        phase === 'done' ? <><span aria-hidden="true">✓</span>{!compact && <span>Done</span>}<span className="wp-sr-only">Done</span></> :
          <><span aria-hidden="true">!</span>{!compact && <span>Try again</span>}<span className="wp-sr-only">Action failed</span></>}
    </span>}
  </button>;
}

export default function WeddingPlanner({ shared = false }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(blankPlan);
  const [planId, setPlanId] = useState(null);
  const [shareToken, setShareToken] = useState(token);
  const [plans, setPlans] = useState([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('Loading plan…');
  const [notice, setNotice] = useState('');
  const [trackQuery, setTrackQuery] = useState('');
  const [newTrack, setNewTrack] = useState({ title: '', artist: '' });
  const [newListSong, setNewListSong] = useState({ mustPlay: { title: '', artist: '' }, doNotPlay: { title: '', artist: '' } });
  const [suggestion, setSuggestion] = useState({ section: 'Open dance', text: '' });
  const [printMode, setPrintMode] = useState('');
  const revision = useRef(0);

  const loadOwner = useCallback(async () => {
    setReady(false);
    setStatus('Loading saved weddings…');
    try {
      const result = await api.weddingPlans();
      setPlans(result.plans || []);
      if (result.plans?.length) {
        const saved = result.plans[0];
        setPlanId(saved.id);
        setShareToken(saved.share_token);
        setPlan({ ...blankPlan(), ...(saved.plan || {}) });
        setStatus('Saved');
      } else {
        const created = await api.createWeddingPlan(blankPlan());
        setPlanId(created.id);
        setShareToken(created.share_token);
        setPlan({ ...blankPlan(), ...(created.plan || {}) });
        setPlans([{ id: created.id, share_token: created.share_token, plan: created.plan, updated_at: created.updated_at }]);
        setStatus('Saved');
      }
    } catch (e) {
      if (e.status === 401) navigate('/login', { replace: true });
      else setStatus('Could not load weddings. Refresh to try again.');
    } finally { setReady(true); setDirty(false); }
  }, [navigate]);

  useEffect(() => {
    document.title = shared ? 'Wedding Music Plan · DJ Request Live' : 'Wedding Planner · DJ Request Live';
    if (shared) {
      setReady(false);
      api.weddingShare(token).then(result => {
        setPlan({ ...blankPlan(), ...(result.plan || {}) });
        setShareToken(token);
        setStatus('Shared plan');
        setReady(true);
      }).catch(() => { setStatus('This wedding link is no longer available. Ask the DJ for a new link.'); setReady(true); });
    } else loadOwner();
  }, [shared, token, loadOwner]);

  useEffect(() => {
    if (!ready || !dirty || (!shared && !planId)) return undefined;
    const currentRevision = revision.current;
    const timer = setTimeout(async () => {
      setStatus('Saving…');
      try {
        if (shared) await api.saveWeddingShare(token, plan);
        else await api.saveWeddingPlan(planId, plan);
        if (revision.current === currentRevision) {
          setDirty(false);
          setStatus('All changes saved');
        }
      } catch (e) {
        setStatus(e.code === 'wedding_plan_not_found' ? 'This share link is no longer available.' : 'Could not save. Check your connection and try again.');
      }
    }, 850);
    return () => clearTimeout(timer);
  }, [plan, planId, shared, token, dirty, ready]);

  useEffect(() => {
    if (!printMode) return undefined;
    const after = () => setPrintMode('');
    window.addEventListener('afterprint', after);
    const timer = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', after); };
  }, [printMode]);

  const progress = useMemo(() => weddingProgress(plan), [plan]);
  const doNotPlayKeys = useMemo(() => new Set((plan.doNotPlay?.songs || []).map(songKey)), [plan.doNotPlay?.songs]);
  const shareUrl = shareToken ? `${window.location.origin}/wedding/${shareToken}` : '';
  const filteredTracks = useMemo(() => {
    const q = trackQuery.trim().toLowerCase();
    if (!q) return [];
    return songRows().filter(s => `${s.title} ${s.artist} ${s.genre}`.toLowerCase().includes(q)).slice(0, 12);
  }, [trackQuery]);

  function editPlan(updater) {
    revision.current += 1;
    setPlan(previous => typeof updater === 'function' ? updater(previous) : updater);
    setDirty(true);
    setStatus('Changes not saved');
  }
  function patchSection(section, key, value) {
    editPlan(p => ({ ...p, [section]: { ...(p[section] || {}), [key]: value } }));
  }
  function patchArray(section, index, patch) {
    editPlan(p => ({ ...p, [section]: (p[section] || []).map((x, i) => i === index ? { ...x, ...patch } : x) }));
  }
  function markListComplete(section, value) {
    editPlan(p => ({ ...p, [section]: { ...(p[section] || {}), none: value } }));
  }
  function addListSong(section) {
    const song = rowSong(newListSong[section]);
    if (!nonempty(song.title) || !nonempty(song.artist)) return;
    if (section === 'mustPlay' && doNotPlayKeys.has(songKey(song))) { toast('That song is on the do-not-play list. Remove it there before adding it as a must-play.'); return; }
    editPlan(p => ({ ...p, [section]: { ...p[section], none: false, songs: [...(p[section]?.songs || []), song] } }));
    setNewListSong(p => ({ ...p, [section]: { title: '', artist: '' } }));
  }
  function removeListSong(section, index) {
    editPlan(p => ({ ...p, [section]: { ...p[section], songs: p[section].songs.filter((_, i) => i !== index) } }));
  }
  function addOpenDanceSong(song) {
    const clean = rowSong(song);
    if (!clean.title || !clean.artist) return;
    if (doNotPlayKeys.has(songKey(clean))) { toast('That song is on the do-not-play list and cannot be added to open dance.'); return; }
    editPlan(p => ({ ...p, openDance: { ...p.openDance, none: false, custom: [...(p.openDance?.custom || []).filter(s => songKey(s) !== songKey(clean)), clean] } }));
  }
  function removeOpenDanceSong(index) {
    editPlan(p => ({ ...p, openDance: { ...p.openDance, custom: p.openDance.custom.filter((_, i) => i !== index) } }));
  }
  async function createAnother() {
    try {
      setStatus('Creating a wedding plan…');
      const created = await api.createWeddingPlan(blankPlan());
      setPlanId(created.id); setShareToken(created.share_token); setPlan(created.plan);
      setPlans(p => [{ id: created.id, share_token: created.share_token, plan: created.plan, updated_at: created.updated_at }, ...p]);
      setDirty(false); setReady(true); setStatus('Saved');
    } catch (e) { toast(e.code === 'not_signed_in' ? 'Sign in to create a wedding plan.' : 'Could not create a wedding plan.'); return false; }
    return true;
  }
  async function choosePlan(id) {
    if (String(id) === String(planId)) return;
    setReady(false);
    try {
      const selected = await api.weddingPlan(id);
      setPlanId(selected.id); setShareToken(selected.share_token); setPlan({ ...blankPlan(), ...(selected.plan || {}) });
      setDirty(false); setStatus('Saved');
    } catch { setStatus('Could not open that wedding plan.'); }
    finally { setReady(true); }
  }
  async function share() {
    const copied = await copyText(shareUrl);
    if (copied) toast('Wedding link copied.');
    else toast('Could not copy the link. Select and copy it below.');
    return copied;
  }
  function addSuggestion() {
    if (!nonempty(suggestion.text)) return;
    editPlan(p => ({ ...p, suggestions: [...(p.suggestions || []), { ...suggestion, text: suggestion.text.trim(), from: plan.collaboratorName.trim() || 'Family / bridal party', createdAt: Date.now() }] }));
    setSuggestion(x => ({ ...x, text: '' }));
  }

  function suggestStarterMix() {
    const styles = plan.styles || {};
    const likedStyles = Object.entries(styles).filter(([, v]) => v === 'like').map(([k]) => k.toLowerCase());
    const dislikedStyles = Object.entries(styles).filter(([, v]) => v === 'dislike').map(([k]) => k.toLowerCase());
    const artistLikes = String(plan.artists?.like || '').toLowerCase();
    const artistDislikes = String(plan.artists?.dislike || '').toLowerCase();
    const candidates = (plan.openDance?.starters || []).filter(s => !s.removed && !doNotPlayKeys.has(songKey(s)) &&
      !artistDislikes.split(/[\n,;]/).some(a => a.trim() && String(s.artist).toLowerCase().includes(a.trim())));
    const score = s => {
      const genre = String(s.genre || '').toLowerCase();
      const artist = String(s.artist || '').toLowerCase();
      const dislike = dislikedStyles.some(x => genre.includes(x) || x.includes(genre));
      const like = likedStyles.some(x => genre.includes(x) || x.includes(genre));
      const artistBoost = artistLikes.split(/[\n,;]/).some(a => a.trim() && artist.includes(a.trim()));
      return (Number(s.dancefloor || 0) + Number(s.singalong || 0) + Number(s.crossgen || 0)) + (like ? 18 : 0) - (dislike ? 45 : 0) + (artistBoost ? 12 : 0);
    };
    const chosen = [...candidates].sort((a, b) => score(b) - score(a)).slice(0, 12);
    const keys = new Set(chosen.map(songKey));
    editPlan(p => ({
      ...p,
      openDance: {
        ...p.openDance, none: false,
        starters: p.openDance.starters.map(s => ({ ...s, selected: keys.has(songKey(s)) && !s.removed })),
        custom: [...(p.openDance.custom || [])],
      },
    }));
    setNotice(`SI DJ selected ${chosen.length} strong starters using the couple’s style choices, artist preferences, and the wedding song scores. Do-not-play songs are excluded.`);
  }

  const openDanceRows = [
    ...(plan.mustPlay?.songs || []).map(s => ({ ...s, source: 'Must play' })),
    ...(plan.openDance?.starters || []).filter(s => s.selected && !s.removed).map(s => ({ ...s, source: 'SI DJ starter' })),
    ...(plan.openDance?.custom || []).map(s => ({ ...s, source: 'Couple / family pick' })),
  ].filter(s => !doNotPlayKeys.has(songKey(s))).filter((s, i, all) => all.findIndex(x => songKey(x) === songKey(s)) === i);

  function downloadOpenDance() {
    if (!openDanceRows.length) return;
    const body = [
      `${plan.couple?.bride || 'Bride'} & ${plan.couple?.groom || 'Groom'} - Open Dance Playlist`,
      `Wedding date: ${plan.weddingDate || 'Not set'}`,
      plan.spotifyPlaylist ? `Spotify starting playlist: ${spotifyPlaylistHref(plan.spotifyPlaylist) || plan.spotifyPlaylist}` : '',
      '', 'SONG - ARTIST',
      ...openDanceRows.map((s, i) => `${String(i + 1).padStart(2, '0')}. ${s.title} - ${s.artist}`),
    ].filter(Boolean).join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'wedding-open-dance-playlist.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) return <main className="wedding-app"><div className="wp-loading">{status}</div></main>;
  if (!shareToken && !shared) return <main className="wedding-app"><div className="wp-loading">Preparing your wedding workspace…</div></main>;

  const missing = progress.checks.filter(x => !x.ok);
  const shareLink = shareUrl;
  const spotifyUrl = spotifyPlaylistHref(plan.spotifyPlaylist);
  const artistChoices = plan.artists || { like: '', dislike: '', reviewed: false };
  const playlistDisabled = openDanceRows.length === 0;
  const printSheet = () => progress.percent === 100 && setPrintMode('sheet');

  return <main className={`wedding-app ${printMode === 'playlist' ? 'print-playlist' : ''}`}>
    <div className="wp-shell" id="wedding-print-area" aria-busy={!ready}>
      <header className="wp-topbar wedding-no-print">
        <Link to={shared ? '/' : '/studio'} className="wp-wordmark">DJ Request Live <span>Weddings</span></Link>
        <span className="wp-save-status" role="status">{status}</span>
        {!shared && <Link className="wp-small-link" to="/studio">Back to Studio</Link>}
      </header>

      <section className="wp-hero">
        <div className="wp-hero-copy">
          <p className="wp-kicker">A wedding day, in good order</p>
          <h1>{shared ? 'Let’s make this feel like you.' : 'Build the wedding soundtrack together.'}</h1>
          <p className="wp-lede">One shared place for the formalities, family notes, favorite songs, and a dance-floor starting set. Your DJ will have the details in one clear plan.</p>
        </div>
        <div className="wp-progressbox">
          <div className="wp-progress-top"><span>Planning form</span><strong>{progress.percent}%</strong></div>
          <div className="wp-progress"><span style={{ width: `${progress.percent}%` }} /></div>
          <small>{progress.complete} of {progress.total} items answered</small>
        </div>
      </section>

      {!shared && <section className="wp-sharebar wedding-no-print">
        <div className="wp-plan-select">
          <label htmlFor="wp-saved-plans">Your weddings</label>
          <select id="wp-saved-plans" value={planId || ''} onChange={e => choosePlan(e.target.value)}>
            {plans.map(x => <option key={x.id} value={x.id}>{x.plan?.title || `Wedding ${x.id}`}</option>)}
          </select>
          <ActionButton type="button" className="wp-button wp-button-light" onClick={createAnother}>New wedding</ActionButton>
        </div>
        <div className="wp-share-action">
          <div><b>Invite the couple and wedding party</b><small>Anyone with this private link can add details and song choices.</small></div>
          <ActionButton type="button" className="wp-button wp-button-dark" onClick={share}>Copy couple link</ActionButton>
        </div>
        <div className="wp-link-copy"><label htmlFor="wp-share-link">Private planning link</label><input id="wp-share-link" readOnly value={shareLink} onFocus={e => e.target.select()} /></div>
      </section>}

      {shared && <section className="wp-collab-banner">
        <b>Shared wedding workspace</b>
        <span>Changes save for everyone with this link. Add your name below so the DJ knows who contributed.</span>
        <Field label="Your name" value={plan.collaboratorName || ''} onChange={v => editPlan(p => ({ ...p, collaboratorName: v }))} />
      </section>}

      {notice && <div className="wp-notice" role="status"><span>{notice}</span><ActionButton type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</ActionButton></div>}
      {status.startsWith('Could not save') && <div className="wp-error" role="alert">{status}</div>}

      <div className="wp-layout">
        <div className="wp-form-column">
          <div className="wp-print-title"><p>DJ Request Live · Wedding plan</p><h1>{plan.title || 'Wedding music plan'}</h1><small>{plan.couple?.bride} {plan.couple?.groom ? '& ' + plan.couple.groom : ''} {plan.weddingDate ? '· ' + plan.weddingDate : ''}</small></div>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">A</span><div><h2>The couple and point person</h2><p>Start with the people the DJ should contact if a detail needs checking.</p></div></div>
            <Field label="Wedding plan name" value={plan.title} onChange={v => editPlan(p => ({ ...p, title: v }))} placeholder="Garza wedding" required />
            <div className="wp-grid wp-grid-2">
              <Field label="Bride’s name" value={plan.couple?.bride} onChange={v => patchSection('couple', 'bride', v)} required />
              <Field label="Groom’s name" value={plan.couple?.groom} onChange={v => patchSection('couple', 'groom', v)} required />
              <Field label="Primary contact person" value={plan.coordinator?.name} onChange={v => patchSection('coordinator', 'name', v)} placeholder="Coordinator or trusted contact" required />
              <Field label="Primary contact cell" value={plan.coordinator?.phone} onChange={v => patchSection('coordinator', 'phone', v)} type="tel" required />
              <Field label="Wedding date" value={plan.weddingDate || ''} onChange={v => editPlan(p => ({ ...p, weddingDate: v }))} type="date" />
              <Field label="Venue name" value={plan.venue?.name} onChange={v => patchSection('venue', 'name', v)} required />
            </div>
            <Field label="Location and directions" value={plan.venue?.directions} onChange={v => patchSection('venue', 'directions', v)} multiline rows={3} placeholder="Address, entrance, parking, or setup directions" required />
            <h3 className="wp-subhead">Family contact numbers</h3>
            <div className="wp-contact-grid">{(plan.contacts || []).map((person, i) => <div className="wp-contact-row" key={person.role}>
              <b>{person.role}</b><input className="wp-input" aria-label={`${person.role} cell phone`} type="tel" placeholder="Cell phone" value={person.phone || ''} disabled={person.notShared} onChange={e => patchArray('contacts', i, { phone: e.target.value })} />
              <CheckLine checked={person.notShared} onChange={v => patchArray('contacts', i, { notShared: v, phone: v ? '' : person.phone })}>Prefer not to share</CheckLine>
            </div>)}</div>
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">B</span><div><h2>Wedding day schedule</h2><p>Enter a time or mark it “To be determined.” The DJ can help sequence the reception.</p></div></div>
            <div className="wp-time-list">{DAY_SCHEDULE.map(([key, label]) => {
              const value = plan.daySchedule?.[key] || {};
              return <div className="wp-time-row" key={key}><b>{label}</b><input type="time" className="wp-input" aria-label={`${label} time`} value={value.time || ''} disabled={value.tbd} onChange={e => editPlan(p => ({ ...p, daySchedule: { ...p.daySchedule, [key]: { time: e.target.value, tbd: false } } }))} /><CheckLine checked={value.tbd} onChange={v => editPlan(p => ({ ...p, daySchedule: { ...p.daySchedule, [key]: { time: '', tbd: v } } }))}>TBD</CheckLine></div>;
            })}</div>
            <h3 className="wp-subhead">Reception events stay in this order</h3>
            <p className="wp-help">The DJ sets the timing, while this order keeps the formalities clear.</p>
            <div className="wp-time-list">{(plan.receptionSchedule || []).map((item, i) => <div className="wp-time-row" key={item.event}>
              <b><span className="wp-order">{i + 1}</span>{item.event}</b><input type="time" className="wp-input" aria-label={`${item.event} time`} value={item.time || ''} disabled={item.tbd} onChange={e => patchArray('receptionSchedule', i, { time: e.target.value, tbd: false })} /><CheckLine checked={item.tbd} onChange={v => patchArray('receptionSchedule', i, { time: '', tbd: v })}>TBD</CheckLine>
            </div>)}</div>
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">C</span><div><h2>Bridal party announcements</h2><p>Enter names exactly as they should be announced. Members enter as couples; roles are reference only.</p></div></div>
            <div className="wp-table-head"><span>Group</span><span>Names as announced</span><span>Status</span></div>
            {(plan.bridalEntries || []).map((item, i) => <div className="wp-table-row" key={`${item.role}-${i}`}>
              <b>{item.role}</b><input className="wp-input" value={item.names || ''} disabled={item.notApplicable} placeholder="First and last names" onChange={e => patchArray('bridalEntries', i, { names: e.target.value })} /><CheckLine checked={item.notApplicable} onChange={v => patchArray('bridalEntries', i, { notApplicable: v, names: v ? '' : item.names })}>N/A</CheckLine>
            </div>)}
            <p className="wp-help">The announcer reads names only; the role labels are for planning.</p>
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">D</span><div><h2>Special event songs</h2><p>Give each formal moment its song and artist, or mark it not applicable.</p></div></div>
            {(plan.specialSongs || []).map((item, i) => <div className="wp-song-row" key={item.event}>
              <b>{item.event}</b><input className="wp-input" value={item.title || ''} disabled={item.notApplicable} placeholder="Song title" onChange={e => patchArray('specialSongs', i, { title: e.target.value })} /><input className="wp-input" value={item.artist || ''} disabled={item.notApplicable} placeholder="Artist" onChange={e => patchArray('specialSongs', i, { artist: e.target.value })} /><CheckLine checked={item.notApplicable} onChange={v => patchArray('specialSongs', i, { notApplicable: v, title: '', artist: '' })}>N/A</CheckLine>
            </div>)}
          </section>

          {['mustPlay', 'doNotPlay'].map(section => {
            const isMust = section === 'mustPlay';
            const list = plan[section] || { songs: [], none: false };
            return <section className="wp-card" key={section}>
              <div className="wp-section-head"><span className="wp-section-index">{isMust ? 'E' : 'F'}</span><div><h2>{isMust ? 'Must-play songs' : 'Do-not-play songs'}</h2><p>{isMust ? 'Songs special to the couple, family, or friends. These belong in the open-dance portion.' : 'Songs that should never be played, even if a guest requests them.'}</p></div></div>
              {(list.songs || []).map((song, i) => <div className="wp-list-song" key={`${songKey(song)}-${i}`}><span>{song.title}</span><span>{song.artist}</span><ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Remove ${song.title}`} onClick={() => removeListSong(section, i)}>×</ActionButton></div>)}
              {!list.songs?.length && <p className="wp-empty-line">{isMust ? 'No must-play songs added yet.' : 'No restricted songs added yet.'}</p>}
              <div className="wp-add-song wedding-no-print"><input className="wp-input" aria-label={`${isMust ? 'Must-play' : 'Do-not-play'} song title`} placeholder="Song title" value={newListSong[section].title} onChange={e => setNewListSong(p => ({ ...p, [section]: { ...p[section], title: e.target.value } }))} /><input className="wp-input" aria-label="Artist" placeholder="Artist" value={newListSong[section].artist} onChange={e => setNewListSong(p => ({ ...p, [section]: { ...p[section], artist: e.target.value } }))} /><ActionButton type="button" className="wp-button wp-button-light" onClick={() => addListSong(section)}>Add song</ActionButton></div>
              <CheckLine checked={list.none} onChange={v => markListComplete(section, v)}>{isMust ? 'No must-play songs for this wedding' : 'No do-not-play songs for this wedding'}</CheckLine>
            </section>;
          })}

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">G</span><div><h2>Music styles</h2><p>Choose like, dislike, or no preference for every style so the DJ knows what fits.</p></div></div>
            <div className="wp-style-list">{MUSIC_STYLES.map(style => <div className="wp-style-row" key={style}><span>{style}</span><div role="group" aria-label={`${style} preference`} className="wp-choice-group">{[['like','Like'],['dislike','Dislike'],['no-preference','No preference']].map(([value, label]) => <ActionButton key={value} type="button" className={plan.styles?.[style] === value ? 'selected' : ''} aria-pressed={plan.styles?.[style] === value} onClick={() => patchSection('styles', style, value)}>{label}</ActionButton>)}</div></div>)}</div>
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">H</span><div><h2>Artists and DJ behavior</h2><p>Share favorite artists, avoid artists, and the way you want the DJ to work the room.</p></div></div>
            <div className="wp-grid wp-grid-2">
              <Field label="Artists or groups you like" value={artistChoices.like} onChange={v => patchSection('artists', 'like', v)} multiline rows={4} placeholder="One per line" />
              <Field label="Artists or groups you dislike" value={artistChoices.dislike} onChange={v => patchSection('artists', 'dislike', v)} multiline rows={4} placeholder="One per line" />
            </div>
            <CheckLine checked={artistChoices.reviewed} onChange={v => patchSection('artists', 'reviewed', v)}>No additional artist preferences</CheckLine>
            <h3 className="wp-subhead">DJ behavior</h3>
            <div className="wp-behavior-list">{DJ_BEHAVIORS.map(behavior => <div className="wp-behavior-row" key={behavior}><span>{behavior}</span><div role="group" aria-label={`${behavior} preference`} className="wp-choice-group"><ActionButton type="button" className={plan.behaviors?.[behavior] === 'do' ? 'selected' : ''} aria-pressed={plan.behaviors?.[behavior] === 'do'} onClick={() => patchSection('behaviors', behavior, 'do')}>Do it</ActionButton><ActionButton type="button" className={plan.behaviors?.[behavior] === 'dont' ? 'selected' : ''} aria-pressed={plan.behaviors?.[behavior] === 'dont'} onClick={() => patchSection('behaviors', behavior, 'dont')}>Don’t</ActionButton><ActionButton type="button" className={plan.behaviors?.[behavior] === 'no-preference' ? 'selected' : ''} aria-pressed={plan.behaviors?.[behavior] === 'no-preference'} onClick={() => patchSection('behaviors', behavior, 'no-preference')}>No preference</ActionButton></div></div>)}</div>
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">I</span><div><h2>Connect a Spotify starting playlist</h2><p>Paste a playlist link. Use Spotify’s own collaboration setting if the couple wants people to add songs there too.</p></div></div>
            <Field label="Spotify playlist URL" value={plan.spotifyPlaylist || ''} onChange={v => editPlan(p => ({ ...p, spotifyPlaylist: v }))} placeholder="https://open.spotify.com/playlist/…" />
            {nonempty(plan.spotifyPlaylist) && (spotifyUrl ? <a className="wp-external-link wedding-no-print" href={spotifyUrl} target="_blank" rel="noreferrer">Open the couple’s playlist in Spotify</a> : <p className="wp-inline-error">Paste a Spotify playlist link or spotify:playlist link.</p>)}
          </section>

          <section className="wp-card wp-open-dance">
            <div className="wp-section-head"><span className="wp-section-index">J</span><div><h2>Open dance: start with 40 SI DJ picks</h2><p>A useful mix from DJ Request Live’s highest dance-floor, sing-along, and cross-generation scores. Keep the songs that fit, cross off the rest, then add family favorites.</p></div></div>
            <div className="wp-starter-tools wedding-no-print"><span><b>{(plan.openDance?.starters || []).filter(s => s.selected && !s.removed && !doNotPlayKeys.has(songKey(s))).length}</b> of 40 starters kept</span><div><ActionButton type="button" className="wp-button wp-button-light" onClick={suggestStarterMix}>Suggest 12 for this couple</ActionButton><ActionButton type="button" className="wp-button wp-button-light" onClick={() => editPlan(p => ({ ...p, openDance: { ...p.openDance, none: false, starters: p.openDance.starters.map(s => ({ ...s, selected: !s.removed && !doNotPlayKeys.has(songKey(s)) })) } }))}>Keep all 40</ActionButton><ActionButton type="button" className="wp-button wp-button-quiet" onClick={() => editPlan(p => ({ ...p, openDance: { ...p.openDance, starters: weddingStarters() } }))}>Restore 40</ActionButton></div></div>
            {notice && <p className="wp-help wedding-no-print">{notice}</p>}
            <div className="wp-starter-list">{(plan.openDance?.starters || []).map((song, originalIndex) => ({ song, originalIndex })).filter(({ song }) => !song.removed).map(({ song, originalIndex: i }) => <div className="wp-starter-row" key={`${songKey(song)}-${i}`}>
              <label className="wp-keep"><input type="checkbox" checked={!!song.selected && !doNotPlayKeys.has(songKey(song))} disabled={doNotPlayKeys.has(songKey(song))} onChange={e => editPlan(p => ({ ...p, openDance: { ...p.openDance, none: false, starters: p.openDance.starters.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x) } }))} /><span>{doNotPlayKeys.has(songKey(song)) ? 'Do not play' : 'Keep'}</span></label>
              <div><b>{song.title}</b><span>{song.artist}</span></div><small>{song.genre || 'Open dance'}</small>
              <ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Cross off ${song.title}`} title="Cross off this starter" onClick={() => editPlan(p => ({ ...p, openDance: { ...p.openDance, starters: p.openDance.starters.map((x, j) => j === i ? { ...x, selected: false, removed: true } : x) } }))}>×</ActionButton>
            </div>)}</div>
            <div className="wp-add-custom wedding-no-print"><div className="wp-grid wp-grid-2"><Field label="Add another song" value={newTrack.title} onChange={v => setNewTrack(p => ({ ...p, title: v }))} placeholder="Song title" /><Field label="Artist" value={newTrack.artist} onChange={v => setNewTrack(p => ({ ...p, artist: v }))} placeholder="Artist name" /></div><ActionButton type="button" className="wp-button wp-button-dark" onClick={() => { if (newTrack.title.trim() && newTrack.artist.trim()) { addOpenDanceSong(newTrack); setNewTrack({ title: '', artist: '' }); } }}>Add to open dance</ActionButton></div>
            <div className="wp-library-search wedding-no-print"><Field label="Find a song in the DJ Request Live song guide" value={trackQuery} onChange={setTrackQuery} placeholder="Search title, artist, or style" />{filteredTracks.length > 0 && <div className="wp-search-results">{filteredTracks.map(song => <ActionButton type="button" key={songKey(song)} onClick={() => addOpenDanceSong(song)}><span><b>{song.title}</b><small>{song.artist} · {song.genre}</small></span><strong>Add</strong></ActionButton>)}</div>}</div>
            <CheckLine checked={!!plan.openDance?.none} onChange={v => markListComplete('openDance', v)}>No preselected open-dance songs; let the DJ read the room</CheckLine>
            {(plan.openDance?.custom || []).length > 0 && <div className="wp-custom-list">{plan.openDance.custom.map((song, i) => <div className="wp-list-song" key={`${songKey(song)}-${i}`}><span>{song.title}</span><span>{song.artist}</span><ActionButton type="button" className="wp-icon-button wedding-no-print" aria-label={`Remove ${song.title}`} onClick={() => removeOpenDanceSong(i)}>×</ActionButton></div>)}</div>}
          </section>

          <section className="wp-card">
            <div className="wp-section-head"><span className="wp-section-index">K</span><div><h2>Notes from family and the wedding party</h2><p>Share a song, a pronunciation note, or a detail the DJ should know. The contributor’s name is saved with the note.</p></div></div>
            <div className="wp-add-suggestion wedding-no-print"><select className="wp-input" aria-label="Suggestion section" value={suggestion.section} onChange={e => setSuggestion(p => ({ ...p, section: e.target.value }))}><option>Open dance</option><option>Special event song</option><option>Schedule</option><option>Announcement</option><option>Other note</option></select><input className="wp-input" aria-label="Family or bridal-party suggestion" value={suggestion.text} onChange={e => setSuggestion(p => ({ ...p, text: e.target.value }))} placeholder="Add a song or note" /><ActionButton type="button" className="wp-button wp-button-dark" onClick={addSuggestion}>Add note</ActionButton></div>
            {(plan.suggestions || []).length ? <ul className="wp-suggestions">{plan.suggestions.map((x, i) => <li key={`${x.createdAt || ''}-${i}`}><span className="wp-suggestion-section">{x.section}</span><b>{x.text}</b><small>From {x.from || 'Wedding party'}</small></li>)}</ul> : <p className="wp-empty-line">No family notes yet. Share the couple link to invite contributions.</p>}
            <Field label="Anything else the DJ should know?" value={plan.notes || ''} onChange={v => editPlan(p => ({ ...p, notes: v }))} multiline rows={4} placeholder="Venue restrictions, accessibility, surprises, or family details" />
          </section>
        </div>

        <aside className="wp-sidebar wedding-no-print">
          <section className="wp-side-card">
            <p className="wp-side-kicker">Before you export</p>
            <h2>{progress.percent === 100 ? 'The planning sheet is complete.' : 'Keep going, one detail at a time.'}</h2>
            <div className="wp-progress"><span style={{ width: `${progress.percent}%` }} /></div>
            {missing.length > 0 ? <><p className="wp-side-note">A completed item has an answer, a time marked TBD, or a clear N/A.</p><ul className="wp-missing">{missing.slice(0, 8).map(x => <li key={x.label}>{x.label}</li>)}{missing.length > 8 && <li>And {missing.length - 8} more items</li>}</ul></> : <p className="wp-side-note">All required form items have been answered.</p>}
          </section>
          <section className="wp-side-card wp-export-card">
            <p className="wp-side-kicker">Take it with you</p>
            <ActionButton type="button" className="wp-button wp-button-dark wp-wide" disabled={progress.percent < 100} onClick={printSheet}>Save planning sheet as PDF</ActionButton>
            <ActionButton type="button" className="wp-button wp-button-light wp-wide" disabled={playlistDisabled} onClick={downloadOpenDance}>Download open-dance playlist (.txt)</ActionButton>
            <ActionButton type="button" className="wp-button wp-button-light wp-wide" disabled={playlistDisabled} onClick={() => setPrintMode('playlist')}>Save playlist as PDF</ActionButton>
            <small>For PDF, choose “Save as PDF” in the print window.</small>
          </section>
          <section className="wp-side-card wp-playlist-preview wedding-print-playlist">
            <p className="wp-side-kicker">Open dance playlist</p>
            <h2>{plan.couple?.bride || 'Bride'} {plan.couple?.groom ? '& ' + plan.couple.groom : ''}</h2>
            {openDanceRows.length ? <ol>{openDanceRows.map(song => <li key={songKey(song)}><b>{song.title}</b><span>{song.artist}</span></li>)}</ol> : <p className="wp-side-note">No songs kept yet.</p>}
            {spotifyUrl && <p className="wp-side-note">Spotify starting playlist: {spotifyUrl}</p>}
          </section>
        </aside>
      </div>
      <footer className="wp-footer">DJ Request Live · Wedding music planning</footer>
    </div>
  </main>;
}
