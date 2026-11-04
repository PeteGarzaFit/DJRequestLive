import test from 'node:test';
import assert from 'node:assert/strict';
import { eventOpenDanceSongs, eventSpecialDanceSongs } from '../lib/eventPlaylists.js';
import { exactSpotifySong } from '../lib/spotifySongMatch.js';

test('custom-only requests work without selecting any starter songs', () => {
  const plan = { openDance: { starters: [{ title: 'Suggested', artist: 'Starter', selected: false }], custom: [{ title: 'Client song', artist: 'Client artist' }] } };
  assert.deepEqual(eventOpenDanceSongs(plan), plan.openDance.custom);
  plan.openDance.starters[0].selected = true;
  assert.equal(eventOpenDanceSongs(plan).length, 2);
  plan.doNotPlay = { songs: [plan.openDance.starters[0]] };
  assert.deepEqual(eventOpenDanceSongs(plan), plan.openDance.custom);
});

test('special songs stay separate and legacy participants are not sent to Spotify as song titles', () => {
  const plan = { specialDances: [
    { title: 'Obby & Mimi Dance', artist: 'Remember When - Alan Jackson' },
    { title: 'Mimi & Eric Dance', artist: 'What a Wonderful World - Louis Armstrong' },
    { title: 'In My Life', artist: 'The Beatles', label: 'Michelle & Obby' },
  ], openDance: { custom: [{ title: 'Boogie Shoes', artist: 'KC' }] } };
  assert.deepEqual(eventSpecialDanceSongs(plan), [
    { title: 'Remember When', artist: 'Alan Jackson' },
    { title: 'What a Wonderful World', artist: 'Louis Armstrong' },
    { title: 'In My Life', artist: 'The Beatles' },
  ]);
});

test('Spotify matching rejects covers and alternate songs instead of silently substituting', () => {
  const song = { title: 'In My Life', artist: 'The Beatles' };
  const wrongArtist = { name: 'In My Life', artists: [{ name: 'Cover Band' }] };
  const live = { name: 'In My Life - Live', artists: [{ name: 'The Beatles' }] };
  const correct = { name: 'In My Life - Remastered 2009', artists: [{ name: 'The Beatles' }] };
  assert.equal(exactSpotifySong(song, [wrongArtist, live]), undefined);
  assert.equal(exactSpotifySong(song, [wrongArtist, live, correct]), correct);
  assert.equal(exactSpotifySong({ title: 'Waterloo', artist: 'Queen' }, [{ name: 'Waterloo', artists: [{ name: 'ABBA' }] }]), undefined);
});
