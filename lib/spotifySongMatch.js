function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim();
}

export function exactSpotifySong(song, tracks) {
  const title = normalized(song.title);
  const artist = normalized(song.artist);
  return tracks.find(track => {
    // Remaster annotations describe the same recording; live/remix/cover versions do not.
    const name = String(track.name || '').replace(/\s*[-(\[]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?\s*[)\]]?$/i, '');
    return normalized(name) === title && track.artists?.some(item => normalized(item.name) === artist);
  });
}
