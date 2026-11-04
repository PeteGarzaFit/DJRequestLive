import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { eventOpenDanceSongs, eventSpecialDanceSongs } from '../lib/eventPlaylists.js';

const spotifyUrl = value => /^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+(?:\?.*)?$/.test(value || '') ? value : '';

export default function EventSpotifyPlaylists({ plan, onSave, kind }) {
  const [connection, setConnection] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const special = kind === 'special';
  const label = special ? 'Special Dances' : 'Open Dance';
  const songs = special ? eventSpecialDanceSongs(plan) : eventOpenDanceSongs(plan);
  const signature = JSON.stringify(songs);
  const saved = plan.spotifyExports?.[kind];
  const url = spotifyUrl(saved?.url);
  const changed = !!url && saved.signature !== signature;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    api.spotifyStatus().then(value => { if (active) setConnection(value); }).catch(err => { if (active) setConnection({ connected: false, error: err.code }); });
    return () => { active = false; };
  }, []);

  async function generate() {
    if (busy || !songs.length) return;
    setBusy(true); setError('');
    try {
      const response = await api.spotifyCreatePlaylist({
        name: `${plan.title || 'Event'} — ${label}`.slice(0, 100),
        description: `${label} songs for ${plan.title || 'this event'} · DJ Request Live`,
        visibility: 'private', strictMatch: true, songs,
      });
      if (!response.playlist?.url) throw new Error('missing_playlist_url');
      if (active.current) onSave(kind, { ...response.playlist, signature });
    } catch (err) {
      setError(err.code === 'spotify_reconnect_required' ? 'Reconnect Spotify, then try again.' : err.code === 'spotify_not_configured' ? 'Spotify is not configured on the server.' : 'Could not create this Spotify playlist. Try again.');
    } finally { setBusy(false); }
  }

  return <div className="wp-spotify-tools wedding-no-print">
    <h3 className="wp-subhead">{label} Spotify playlist</h3>
    <p className="wp-help">{songs.length} song{songs.length === 1 ? '' : 's'} · {special ? 'Only the special dance songs.' : 'Custom songs and suggestions you explicitly keep. Unselected suggestions are excluded.'}</p>
    {connection === null ? <p>Checking Spotify connection…</p> : connection.connected
      ? <button type="button" className="wp-button wp-button-dark" disabled={busy || !songs.length} onClick={generate}>{busy ? 'Creating Spotify playlist…' : `${url ? 'Recreate' : 'Create'} ${label} Playlist`}</button>
      : connection.error === 'spotify_not_configured' ? <p className="wp-inline-error">Spotify is not configured on the server.</p> : <a className="wp-button wp-button-light" href={api.spotifyConnectUrl}>Connect Spotify</a>}
    {url && <p className="wp-spotify-feedback"><a href={url} target="_blank" rel="noreferrer">Open {label} Playlist in Spotify</a> · {saved.added} songs added.</p>}
    {changed && <p className="wp-inline-error" role="status">Songs have changed. Recreate this playlist to include the current selections.</p>}
    {!!saved?.missing?.length && <div className="wp-inline-error" role="status"><b>Review these songs — no exact title and artist match was found:</b><ul>{saved.missing.map((song, index) => <li key={index}>{song.title} — {song.artist}</li>)}</ul></div>}
    {error && <p className="wp-inline-error" role="alert">{error}</p>}
  </div>;
}
