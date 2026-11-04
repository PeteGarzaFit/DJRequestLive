import React from 'react';
import { normalizeSpecialDance } from '../lib/eventPlaylists.js';

function timeLabel(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return 'TBD';
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export default function EventTimelinePrint({ plan }) {
  const moments = (plan.moments || []).filter(moment => !moment.skip);
  const dances = (plan.specialDances || []).map(normalizeSpecialDance).filter(dance => dance.title?.trim() || dance.artist?.trim());
  const rows = moments.flatMap(moment => {
    const row = { name: moment.name, time: timeLabel(moment.time), detail: [moment.song, moment.notes].filter(Boolean).join(' · ') };
    // Special dances follow the featured activity, before open dancing.
    return moment.name === 'Featured activity'
      ? [row, ...dances.map((dance, index) => ({ name: dance.label || `Special dance ${index + 1}`, time: 'TBD', detail: [dance.title, dance.artist].filter(Boolean).join(' — ') }))]
      : [row];
  });
  if (!moments.some(moment => moment.name === 'Featured activity')) {
    const danceRows = dances.map((dance, index) => ({ name: dance.label || `Special dance ${index + 1}`, time: 'TBD', detail: [dance.title, dance.artist].filter(Boolean).join(' — ') }));
    const openDanceIndex = rows.findIndex(row => row.name === 'Open dance begins');
    rows.splice(openDanceIndex < 0 ? rows.length : openDanceIndex, 0, ...danceRows);
  }

  return <section className="event-timeline-print" aria-label="Event timeline">
    <header><p>DJ Request Live · Event timeline</p><h1>{plan.title || 'Event timeline'}</h1>
      <div>{[plan.eventDate, plan.venue?.name].filter(Boolean).join(' · ')}</div>
      {(plan.startTime || plan.endTime) && <div>{plan.startTime ? `Starts ${timeLabel(plan.startTime)}` : ''}{plan.startTime && plan.endTime ? ' · ' : ''}{plan.endTime ? `Ends ${timeLabel(plan.endTime)}` : ''}</div>}
    </header>
    <table><thead><tr><th>Time</th><th>Moment</th><th>Song / cue</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}><td>{row.time}</td><th scope="row">{row.name}</th><td>{row.detail || '—'}</td></tr>)}</tbody>
    </table>
    {!rows.length && <p>No timeline moments added yet.</p>}
  </section>;
}
