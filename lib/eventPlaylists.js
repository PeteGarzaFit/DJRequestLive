const key = song => `${song.title.trim().toLowerCase()}|${song.artist.trim().toLowerCase()}`;
const unique = songs => songs.filter(song => song.title?.trim() && song.artist?.trim()).filter((song, index, all) => all.findIndex(other => key(other) === key(song)) === index);

export function eventOpenDanceSongs(plan) {
  const blocked = new Set((plan.doNotPlay?.songs || []).filter(song => song.title && song.artist).map(key));
  return unique([
    ...(plan.openDance?.starters || []).filter(song => song.selected && !song.removed),
    ...(plan.openDance?.custom || []),
  ]).filter(song => !blocked.has(key(song))).map(({ title, artist }) => ({ title, artist }));
}

export function normalizeSpecialDance(dance) {
  // Older plans stored the participants in title and “song - artist” in artist.
  const parts = String(dance.artist || '').split(' - ');
  if (!dance.label && /\bdance\b/i.test(dance.title || '') && parts.length === 2) {
    return { ...dance, label: dance.title, title: parts[0].trim(), artist: parts[1].trim() };
  }
  return dance;
}

export function eventSpecialDanceSongs(plan) {
  return unique((plan.specialDances || []).map(normalizeSpecialDance)).map(({ title, artist }) => ({ title, artist }));
}
